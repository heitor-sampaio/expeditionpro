import type {
  CompanyInfo,
  CompanyPatch,
  CrewLead,
  TenantRepository,
} from '@expedition/application';
import type { Cpf, LocalDate } from '@expedition/domain';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';

/**
 * Implementação Prisma do port de tenant. Lê `name`/`cnpj`/`slug` da própria linha do
 * tenant (por id, sem a extension de escopo — é a linha que define o escopo).
 *
 * A logo (CF-03) vive em `settings.branding.logo`, ao lado da config de cashback. Toda
 * escrita **mescla** o objeto: gravar `settings` inteiro apagaria a configuração do
 * outro módulo, que é o tipo de perda que ninguém nota até o cashback parar de sair.
 */
export function prismaTenantRepository(base: PrismaClient): TenantRepository {
  return {
    async findIdBySlug(slug: string): Promise<string | null> {
      const row = await base.tenant.findUnique({ where: { slug }, select: { id: true } });
      return row?.id ?? null;
    },

    async getCompanyInfo(tenantId: string): Promise<CompanyInfo> {
      const tenant = await base.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, cnpj: true, slug: true, settings: true },
      });
      return {
        name: tenant?.name ?? '',
        cnpj: tenant?.cnpj ?? null,
        slug: tenant?.slug ?? '',
        logo: readLogo(tenant?.settings),
      };
    },

    async saveCompany(tenantId: string, patch: CompanyPatch): Promise<CompanyInfo> {
      const tenant = await base.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });
      const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
      const branding = (settings.branding ?? {}) as Record<string, unknown>;

      const updated = await base.tenant.update({
        where: { id: tenantId },
        data: {
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.cnpj === undefined ? {} : { cnpj: patch.cnpj }),
          ...(patch.logo === undefined
            ? {}
            : {
                settings: {
                  ...settings,
                  branding: { ...branding, logo: patch.logo },
                } as unknown as Prisma.InputJsonObject,
              }),
        },
        select: { name: true, cnpj: true, slug: true, settings: true },
      });

      return {
        name: updated.name,
        cnpj: updated.cnpj,
        slug: updated.slug,
        logo: readLogo(updated.settings),
      };
    },
    async getCrewLead(tenantId: string): Promise<CrewLead | null> {
      const tenant = await base.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });
      return readCrew(tenant?.settings);
    },

    async saveCrewLead(tenantId: string, lead: CrewLead | null): Promise<CrewLead | null> {
      const tenant = await base.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });
      const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
      const updated = await base.tenant.update({
        where: { id: tenantId },
        data: {
          settings: {
            ...settings,
            crew: lead === null ? null : toStored(lead),
          } as unknown as Prisma.InputJsonObject,
        },
        select: { settings: true },
      });
      return readCrew(updated.settings);
    },
  };
}

/**
 * O condutor no JSON: datas viram ISO e o resto sai como está. Guardar `LocalDate` como
 * objeto funcionaria, mas ISO é o que se lê num dump de banco sem precisar do código.
 */
interface StoredCrew {
  fullName: string;
  cpf: string;
  birthDate: string;
  email: string | null;
  phone: string | null;
  address: CrewLead['address'];
  vehicle: CrewLead['vehicle'];
  companions: { fullName: string; birthDate: string }[];
}

function toStored(lead: CrewLead): StoredCrew {
  return {
    fullName: lead.fullName,
    cpf: lead.cpf,
    birthDate: isoOf(lead.birthDate),
    email: lead.email,
    phone: lead.phone,
    address: lead.address,
    vehicle: lead.vehicle,
    companions: lead.companions.map((companion) => ({
      fullName: companion.fullName,
      birthDate: isoOf(companion.birthDate),
    })),
  };
}

function readCrew(settings: unknown): CrewLead | null {
  const raw = (settings as { crew?: StoredCrew | null } | null)?.crew;
  if (!raw || typeof raw !== 'object' || !raw.fullName) return null;
  return {
    fullName: raw.fullName,
    cpf: raw.cpf as Cpf,
    birthDate: fromIso(raw.birthDate),
    email: raw.email,
    phone: raw.phone,
    address: raw.address,
    vehicle: raw.vehicle,
    companions: (raw.companions ?? []).map((companion) => ({
      fullName: companion.fullName,
      birthDate: fromIso(companion.birthDate),
    })),
  };
}

function isoOf(date: LocalDate): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(date.year)}-${pad(date.month)}-${pad(date.day)}`;
}

function fromIso(iso: string): LocalDate {
  const [year, month, day] = iso.split('-').map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

function readLogo(settings: unknown): string | null {
  const branding = (settings as { branding?: { logo?: unknown } } | null)?.branding;
  return typeof branding?.logo === 'string' && branding.logo !== '' ? branding.logo : null;
}

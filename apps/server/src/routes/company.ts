import { getCompany, getCrewLead, updateCompany, updateCrewLead } from '@expedition/application';
import { LOGO_MAX_BYTES, formatCep, formatCpf, formatPhone } from '@expedition/domain';
import { z } from 'zod';
import type { CompanyInfo, CrewLead } from '@expedition/application';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * Rotas da identidade da empresa (CF-01): razão social, CNPJ e logo. É o que sai no
 * cabeçalho da roomlist e na marca da navegação.
 *
 * O DTO devolve o `slug` porque a navegação monta as iniciais a partir dele quando não
 * há logo; não devolve nada além disso — configuração de outros módulos vive na mesma
 * coluna `settings` e não é assunto desta tela.
 */

const companyBody = z.object({
  name: z.string().trim().min(1).optional(),
  cnpj: z.string().nullable().optional(),
  // O limite também vive no domínio; aqui ele evita carregar o payload até a validação.
  logo: z.string().max(LOGO_MAX_BYTES).nullable().optional(),
});

export function registerCompanyRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get('/v1/company', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const company = await getCompany({ tenants: deps.tenants }, ctx);
    return reply.send(toDto(company));
  });

  typed.put('/v1/company', { schema: { body: companyBody } }, async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const company = await updateCompany(
      { tenants: deps.tenants, audit: deps.audit },
      ctx,
      request.body,
    );
    return reply.send(toDto(company));
  });
}

/**
 * CF-05 — o condutor da empresa (Configurações → Equipe). Rota própria porque é outro
 * assunto: a empresa é identidade, o condutor é uma pessoa com CPF, endereço e família.
 */
const crewBody = z.object({
  fullName: z.string().trim().min(1),
  cpf: z.string().trim().min(1),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'esperado AAAA-MM-DD'),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z
    .object({
      street: z.string().optional(),
      number: z.string().optional(),
      district: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
    })
    .optional(),
  vehicle: z
    .object({ brand: z.string(), model: z.string(), plate: z.string() })
    .nullable()
    .optional(),
  companions: z
    .array(
      z.object({
        fullName: z.string(),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'esperado AAAA-MM-DD'),
      }),
    )
    .optional(),
});

export function registerCrewRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get('/v1/crew', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const lead = await getCrewLead({ tenants: deps.tenants }, ctx);
    return reply.send(crewDto(lead));
  });

  typed.put('/v1/crew', { schema: { body: crewBody } }, async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const lead = await updateCrewLead(
      { tenants: deps.tenants, audit: deps.audit },
      ctx,
      request.body,
    );
    return reply.send(crewDto(lead));
  });
}

/**
 * Datas em ISO no DTO: o `input type=date` da tela fala ISO. CPF, telefone e CEP saem
 * pontuados como em `/v1/customers` — o formulário reexibe o que a rota devolve, e dado
 * cru na tela é o usuário lendo `90000010057` logo depois de digitar `900.000.100-57`.
 */
function crewDto(lead: CrewLead | null) {
  if (lead === null) return null;
  return {
    fullName: lead.fullName,
    cpf: formatCpf(lead.cpf),
    birthDate: isoOf(lead.birthDate),
    email: lead.email,
    phone: lead.phone ? formatPhone(lead.phone) : null,
    address: { ...lead.address, zip: lead.address.zip ? formatCep(lead.address.zip) : null },
    vehicle: lead.vehicle,
    companions: lead.companions.map((companion) => ({
      fullName: companion.fullName,
      birthDate: isoOf(companion.birthDate),
    })),
  };
}

function isoOf(date: { year: number; month: number; day: number }): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(date.year)}-${pad(date.month)}-${pad(date.day)}`;
}

function toDto(company: CompanyInfo) {
  return {
    name: company.name,
    cnpj: company.cnpj,
    slug: company.slug,
    logo: company.logo,
  };
}

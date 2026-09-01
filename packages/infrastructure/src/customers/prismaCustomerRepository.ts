import type {
  Address,
  CustomerRecord,
  CustomerRepository,
  CustomerSort,
  NewCustomer,
} from '@expedition/application';
import type { Cpf, LocalDate } from '@expedition/domain';
import type { Customer as PrismaCustomer, Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma do port de clientes. Toda operação passa pelo tenantClient,
 * que injeta o tenant (§2.2). Converte as bordas: LocalDate ↔ Date, string ↔ Cpf.
 * O domínio não aparece como Prisma, e o Prisma não vaza para a aplicação.
 */
export function prismaCustomerRepository(base: PrismaClient): CustomerRepository {
  return {
    async findByCpf(tenantId: string, cpf: Cpf): Promise<CustomerRecord | null> {
      const row = await tenantClient(base, tenantId).customer.findFirst({ where: { cpf } });
      return row ? toRecord(row) : null;
    },

    async findById(tenantId: string, id: string): Promise<CustomerRecord | null> {
      const row = await tenantClient(base, tenantId).customer.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    },

    async listByIds(tenantId: string, ids: readonly string[]): Promise<CustomerRecord[]> {
      if (ids.length === 0) return [];
      const rows = await tenantClient(base, tenantId).customer.findMany({
        where: { id: { in: [...new Set(ids)] } },
      });
      return rows.map(toRecord);
    },

    async listByResponsible(tenantId: string, responsibleId: string): Promise<CustomerRecord[]> {
      const rows = await tenantClient(base, tenantId).customer.findMany({
        where: { responsibleId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toRecord);
    },

    async search(tenantId: string, query: string, sort: CustomerSort): Promise<CustomerRecord[]> {
      const trimmed = query.trim();
      const digits = query.replace(/\D/g, '');
      const conditions: Prisma.CustomerWhereInput[] = [];
      if (trimmed) {
        conditions.push({ fullName: { contains: trimmed, mode: 'insensitive' } });
        conditions.push({ phone: { contains: trimmed } });
      }
      if (digits) {
        conditions.push({ cpf: { contains: digits } });
        conditions.push({ phone: { contains: digits } });
      }
      if (conditions.length === 0) return [];
      const rows = await tenantClient(base, tenantId).customer.findMany({
        where: { OR: conditions },
        orderBy: orderByOf(sort),
      });
      return rows.map(toRecord);
    },

    async listResponsibles(tenantId: string, sort: CustomerSort): Promise<CustomerRecord[]> {
      const rows = await tenantClient(base, tenantId).customer.findMany({
        where: { responsibleId: null },
        orderBy: orderByOf(sort),
      });
      return rows.map(toRecord);
    },

    async create(data: NewCustomer): Promise<CustomerRecord> {
      const row = await tenantClient(base, data.tenantId).customer.create({
        data: {
          tenantId: data.tenantId,
          responsibleId: data.responsibleId,
          fullName: data.fullName,
          cpf: data.cpf,
          birthDate: localDateToDate(data.birthDate),
          email: data.email,
          phone: data.phone,
          addressStreet: data.address.street,
          addressNumber: data.address.number,
          addressDistrict: data.address.district,
          addressCity: data.address.city,
          addressState: data.address.state,
          addressZip: data.address.zip,
        },
      });
      return toRecord(row);
    },

    async updateResponsible(
      tenantId: string,
      customerId: string,
      responsibleId: string | null,
    ): Promise<CustomerRecord> {
      const row = await tenantClient(base, tenantId).customer.update({
        where: { id: customerId },
        data: { responsibleId },
      });
      return toRecord(row);
    },

    async updateIdentity(
      tenantId: string,
      customerId: string,
      identity: { fullName?: string; cpf?: Cpf; birthDate?: LocalDate },
    ): Promise<CustomerRecord> {
      const row = await tenantClient(base, tenantId).customer.update({
        where: { id: customerId },
        data: {
          ...(identity.fullName !== undefined ? { fullName: identity.fullName } : {}),
          ...(identity.cpf !== undefined ? { cpf: identity.cpf } : {}),
          ...(identity.birthDate !== undefined
            ? { birthDate: localDateToDate(identity.birthDate) }
            : {}),
        },
      });
      return toRecord(row);
    },

    async updateContactInfo(
      tenantId: string,
      customerId: string,
      contact: { email?: string; phone?: string },
    ): Promise<CustomerRecord> {
      const row = await tenantClient(base, tenantId).customer.update({
        where: { id: customerId },
        data: {
          ...(contact.email !== undefined ? { email: contact.email } : {}),
          ...(contact.phone !== undefined ? { phone: contact.phone } : {}),
        },
      });
      return toRecord(row);
    },

    async linkAuthUser(
      tenantId: string,
      customerId: string,
      authUserId: string,
      portalStatus: string,
    ): Promise<void> {
      await tenantClient(base, tenantId).customer.update({
        where: { id: customerId },
        data: { authUserId, portalStatus, invitedAt: new Date() },
      });
    },

    async updateProfile(
      tenantId: string,
      customerId: string,
      profile: {
        fullName: string;
        cpf: Cpf;
        birthDate: LocalDate;
        email: string | null;
        phone: string | null;
        address: Address;
      },
    ): Promise<CustomerRecord> {
      const row = await tenantClient(base, tenantId).customer.update({
        where: { id: customerId },
        data: {
          fullName: profile.fullName,
          cpf: profile.cpf,
          birthDate: localDateToDate(profile.birthDate),
          email: profile.email,
          phone: profile.phone,
          addressStreet: profile.address.street,
          addressNumber: profile.address.number,
          addressDistrict: profile.address.district,
          addressCity: profile.address.city,
          addressState: profile.address.state,
          addressZip: profile.address.zip,
        },
      });
      return toRecord(row);
    },

    async updateContact(
      tenantId: string,
      customerId: string,
      contact: { email: string | null; phone: string | null; address: Address },
    ): Promise<CustomerRecord> {
      const row = await tenantClient(base, tenantId).customer.update({
        where: { id: customerId },
        data: {
          email: contact.email,
          phone: contact.phone,
          addressStreet: contact.address.street,
          addressNumber: contact.address.number,
          addressDistrict: contact.address.district,
          addressCity: contact.address.city,
          addressState: contact.address.state,
          addressZip: contact.address.zip,
        },
      });
      return toRecord(row);
    },

    async reassignDependents(
      tenantId: string,
      fromResponsibleId: string,
      toResponsibleId: string,
    ): Promise<void> {
      await tenantClient(base, tenantId).customer.updateMany({
        where: { responsibleId: fromResponsibleId },
        data: { responsibleId: toResponsibleId },
      });
    },

    async deleteCustomer(tenantId: string, customerId: string): Promise<void> {
      await tenantClient(base, tenantId).customer.delete({ where: { id: customerId } });
    },
  };
}

/** 'name' → nome A→Z; 'created' → mais recente primeiro (CL-04). */
function orderByOf(sort: CustomerSort): Prisma.CustomerOrderByWithRelationInput {
  return sort === 'created' ? { createdAt: 'desc' } : { fullName: 'asc' };
}

function toRecord(row: PrismaCustomer): CustomerRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    responsibleId: row.responsibleId,
    fullName: row.fullName,
    cpf: row.cpf as Cpf,
    birthDate: dateToLocalDate(row.birthDate),
    email: row.email,
    phone: row.phone,
    address: {
      street: row.addressStreet,
      number: row.addressNumber,
      district: row.addressDistrict,
      city: row.addressCity,
      state: row.addressState,
      zip: row.addressZip,
    },
  };
}

function localDateToDate(date: LocalDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function dateToLocalDate(date: Date): LocalDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

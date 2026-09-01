import type {
  IdentityChangeRepository,
  IdentityChangeRequestRecord,
  IdentityDecision,
  NewIdentityChangeRequest,
} from '@expedition/application';
import type { LocalDate } from '@expedition/domain';
import type { IdentityChangeRequest as PrismaRow } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma da fila de identidade (PC-07). Converte as bordas: LocalDate ↔
 * Date (nascimento), Cpf/string. O tenant é injetado pela Client Extension.
 */
export function prismaIdentityChangeRepository(base: PrismaClient): IdentityChangeRepository {
  return {
    async create(request: NewIdentityChangeRequest): Promise<IdentityChangeRequestRecord> {
      const row = await tenantClient(base, request.tenantId).identityChangeRequest.create({
        data: {
          tenantId: request.tenantId,
          customerId: request.customerId,
          requestedBy: request.requestedBy,
          fullName: request.fullName,
          cpf: request.cpf,
          birthDate: request.birthDate ? localDateToDate(request.birthDate) : null,
          email: request.email,
          phone: request.phone,
          reason: request.reason,
        },
      });
      return toRecord(row);
    },

    async findById(tenantId: string, id: string): Promise<IdentityChangeRequestRecord | null> {
      const row = await tenantClient(base, tenantId).identityChangeRequest.findUnique({
        where: { id },
      });
      return row ? toRecord(row) : null;
    },

    async listPending(tenantId: string): Promise<IdentityChangeRequestRecord[]> {
      const rows = await tenantClient(base, tenantId).identityChangeRequest.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toRecord);
    },

    async decide(
      tenantId: string,
      id: string,
      decision: IdentityDecision,
    ): Promise<IdentityChangeRequestRecord> {
      const row = await tenantClient(base, tenantId).identityChangeRequest.update({
        where: { id },
        data: {
          status: decision.status,
          decidedBy: decision.decidedBy,
          decidedAt: decision.decidedAt,
          decisionNote: decision.decisionNote,
        },
      });
      return toRecord(row);
    },
  };
}

function toRecord(row: PrismaRow): IdentityChangeRequestRecord {
  return {
    id: row.id,
    customerId: row.customerId,
    status: row.status,
    fullName: row.fullName,
    cpf: row.cpf,
    birthDate: row.birthDate ? dateToLocalDate(row.birthDate) : null,
    email: row.email,
    phone: row.phone,
    reason: row.reason,
    decidedBy: row.decidedBy,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt,
  };
}

function localDateToDate(date: LocalDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function dateToLocalDate(date: Date): LocalDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

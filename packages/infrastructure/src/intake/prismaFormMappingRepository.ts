import type { FormMappingRecord, FormMappingRepository } from '@expedition/application';
import type { FormMapping as PrismaRow } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma do mapa form_id→roteiro (IN-20). O tenant é injetado pela Client
 * Extension; a unicidade `(tenant_id, source, form_id)` é garantida no banco, então o
 * `upsert` resolve por esse trio.
 */
export function prismaFormMappingRepository(base: PrismaClient): FormMappingRepository {
  return {
    async resolveItinerary(
      tenantId: string,
      source: string,
      formId: string,
    ): Promise<string | null> {
      const row = await tenantClient(base, tenantId).formMapping.findFirst({
        where: { source, formId },
        select: { itineraryId: true },
      });
      return row?.itineraryId ?? null;
    },

    async list(tenantId: string): Promise<FormMappingRecord[]> {
      const rows = await tenantClient(base, tenantId).formMapping.findMany({
        orderBy: { formId: 'asc' },
      });
      return rows.map(toRecord);
    },

    async upsert(
      tenantId: string,
      source: string,
      formId: string,
      itineraryId: string,
    ): Promise<FormMappingRecord> {
      const db = tenantClient(base, tenantId);
      const existing = await db.formMapping.findFirst({ where: { source, formId } });
      if (existing) {
        const updated = await db.formMapping.update({
          where: { id: existing.id },
          data: { itineraryId },
        });
        return toRecord(updated);
      }
      const created = await db.formMapping.create({
        data: { tenantId, source, formId, itineraryId },
      });
      return toRecord(created);
    },

    async remove(tenantId: string, id: string): Promise<boolean> {
      const result = await tenantClient(base, tenantId).formMapping.deleteMany({ where: { id } });
      return result.count > 0;
    },
  };
}

function toRecord(row: PrismaRow): FormMappingRecord {
  return {
    id: row.id,
    source: row.source,
    formId: row.formId,
    itineraryId: row.itineraryId,
  };
}

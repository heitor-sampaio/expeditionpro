import type { AuditLogEntry, AuditLogRepository, NewAuditLogEntry } from '@expedition/application';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuditLog as PrismaRow } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma da trilha de auditoria (§3.2.1 · A09). Append-only: só grava e
 * lê por entidade. O `diff` é jsonb; o tenant é injetado pela Client Extension.
 */
export function prismaAuditLogRepository(base: PrismaClient): AuditLogRepository {
  return {
    async record(entry: NewAuditLogEntry): Promise<AuditLogEntry> {
      const row = await tenantClient(base, entry.tenantId).auditLog.create({
        data: {
          tenantId: entry.tenantId,
          actorUserId: entry.actorUserId,
          entity: entry.entity,
          entityId: entry.entityId,
          action: entry.action,
          diff: entry.diff as Prisma.InputJsonValue,
        },
      });
      return toEntry(row);
    },

    async listByEntity(
      tenantId: string,
      entity: string,
      entityId: string,
    ): Promise<AuditLogEntry[]> {
      const rows = await tenantClient(base, tenantId).auditLog.findMany({
        where: { entity, entityId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toEntry);
    },
  };
}

function toEntry(row: PrismaRow): AuditLogEntry {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    entity: row.entity,
    entityId: row.entityId,
    action: row.action,
    diff: (row.diff ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

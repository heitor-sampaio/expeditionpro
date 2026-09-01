import type { AuditLogEntry, AuditLogRepository, NewAuditLogEntry } from './auditLogRepository.js';

/** Fake in-memory da trilha de auditoria. Excluído do build (`*.fake.ts`). */
export function fakeAuditLogRepository(): AuditLogRepository & {
  rows: (AuditLogEntry & { tenantId: string })[];
} {
  const rows: (AuditLogEntry & { tenantId: string })[] = [];
  let seq = 0;

  return {
    rows,
    record(entry: NewAuditLogEntry) {
      seq += 1;
      const row: AuditLogEntry & { tenantId: string } = {
        id: `audit-${seq}`,
        tenantId: entry.tenantId,
        actorUserId: entry.actorUserId,
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        diff: entry.diff,
        createdAt: new Date(0),
      };
      rows.push(row);
      return Promise.resolve(row);
    },
    listByEntity(tenantId: string, entity: string, entityId: string) {
      const found = rows.filter(
        (r) => r.tenantId === tenantId && r.entity === entity && r.entityId === entityId,
      );
      return Promise.resolve([...found].reverse());
    },
  };
}

import type {
  AutomationPatch,
  AutomationRecord,
  AutomationRepository,
  NewAutomation,
} from './automationRepository.js';

type Row = AutomationRecord & { tenantId: string; deletedAt: Date | null };

/** Fake in-memory das automações (§5.18). Fora do build. */
export function fakeAutomationRepository(): AutomationRepository & { rows: Row[] } {
  const rows: Row[] = [];
  let seq = 0;

  const vivas = (tenantId: string) =>
    rows.filter((r) => r.tenantId === tenantId && r.deletedAt === null);

  return {
    rows,

    list: (tenantId) => Promise.resolve(vivas(tenantId)),

    findById: (tenantId, id) => Promise.resolve(vivas(tenantId).find((r) => r.id === id) ?? null),

    findByName: (tenantId, name) => {
      const alvo = name.trim().toLowerCase();
      return Promise.resolve(vivas(tenantId).find((r) => r.name.toLowerCase() === alvo) ?? null);
    },

    create(automation: NewAutomation) {
      seq += 1;
      const record: Row = {
        tenantId: automation.tenantId,
        id: `auto-${seq}`,
        name: automation.name,
        description: automation.description,
        // AU-14: o gatilho chega no primeiro salvamento do desenho, não na criação.
        triggerType: null,
        triggerConfig: {},
        graph: automation.graph,
        enabled: false,
        runAsUserId: null,
        createdAt: new Date('2026-09-03T00:00:00Z'),
        updatedAt: new Date('2026-09-03T00:00:00Z'),
        deletedAt: null,
      };
      rows.push(record);
      return Promise.resolve(record);
    },

    update(tenantId, id, patch: AutomationPatch) {
      const i = rows.findIndex((r) => r.tenantId === tenantId && r.id === id);
      rows[i] = { ...rows[i]!, ...patch, updatedAt: new Date('2026-09-03T01:00:00Z') };
      return Promise.resolve(rows[i]!);
    },

    listTimeTriggersAcrossTenants: () =>
      Promise.resolve(
        rows
          .filter(
            (r) =>
              r.deletedAt === null &&
              r.enabled &&
              (r.triggerType === 'scheduled' || r.triggerType === 'recurring'),
          )
          .map((r) => ({
            tenantId: r.tenantId,
            automationId: r.id,
            triggerType: r.triggerType!,
            triggerConfig: r.triggerConfig,
          })),
      ),

    softDelete(tenantId, id) {
      const i = rows.findIndex((r) => r.tenantId === tenantId && r.id === id);
      if (i >= 0) rows[i] = { ...rows[i]!, deletedAt: new Date('2026-09-03T02:00:00Z') };
      return Promise.resolve();
    },
  };
}

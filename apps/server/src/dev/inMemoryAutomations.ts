import type {
  AutomationPatch,
  AutomationRecord,
  AutomationRepository,
  NewAutomation,
} from '@expedition/application';

type Row = AutomationRecord & { tenantId: string; deletedAt: Date | null };

/**
 * Automações em memória — SÓ para dev sem banco e testes de rota (§5.18).
 *
 * Escrito aqui, e não reaproveitado do fake da aplicação, porque `*.fake.ts` fica fora do
 * build daquele pacote: o servidor não alcança. É a mesma razão de `inMemoryOpportunities`.
 */
export function inMemoryAutomations(): AutomationRepository & { rows: Row[] } {
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
        id: `auto-mem-${seq}`,
        name: automation.name,
        description: automation.description,
        triggerType: automation.triggerType,
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

    softDelete(tenantId, id) {
      const i = rows.findIndex((r) => r.tenantId === tenantId && r.id === id);
      if (i >= 0) rows[i] = { ...rows[i]!, deletedAt: new Date('2026-09-03T02:00:00Z') };
      return Promise.resolve();
    },
  };
}

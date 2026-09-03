import type {
  AutomationPatch,
  AutomationRecord,
  AutomationRepository,
  AutomationRunPatch,
  AutomationRunRecord,
  AutomationRunRepository,
  AutomationRunStepRepository,
  DueRunRef,
  NewAutomation,
  NewAutomationRun,
  NewRunStep,
  RunStepRecord,
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

type RunRow = AutomationRunRecord & { lockedBy: string | null; lockedAt: Date | null };

/**
 * Execuções e log em memória — SÓ para dev sem banco e testes de rota (§5.18).
 *
 * `claimDue` imita a reivindicação de verdade, inclusive a recuperação do que ficou carimbado
 * por um processo que morreu. Um fake permissivo aqui faria o teste de "dois relógios não pegam
 * a mesma execução" provar nada.
 */
export function inMemoryAutomationRuns(): {
  automationRuns: AutomationRunRepository;
  automationRunSteps: AutomationRunStepRepository;
} {
  const runs: RunRow[] = [];
  const steps: (RunStepRecord & { tenantId: string; runId: string })[] = [];
  let seq = 0;

  return {
    automationRuns: {
      enqueue(run: NewAutomationRun) {
        if (
          run.idempotencyKey !== null &&
          runs.some(
            (r) =>
              r.tenantId === run.tenantId &&
              r.automationId === run.automationId &&
              r.idempotencyKey === run.idempotencyKey,
          )
        ) {
          return Promise.resolve(null);
        }
        seq += 1;
        const row: RunRow = {
          id: `run-mem-${seq}`,
          tenantId: run.tenantId,
          automationId: run.automationId,
          triggerRef: run.triggerRef,
          idempotencyKey: run.idempotencyKey,
          status: 'pending',
          currentNodeId: null,
          variables: run.variables,
          wakeAt: run.wakeAt,
          stepsTaken: 0,
          attempts: 0,
          lastError: null,
          createdAt: run.wakeAt,
          updatedAt: run.wakeAt,
          lockedBy: null,
          lockedAt: null,
        };
        runs.push(row);
        return Promise.resolve(row);
      },

      findById: (tenantId, id) =>
        Promise.resolve(runs.find((r) => r.tenantId === tenantId && r.id === id) ?? null),

      listByAutomation: (tenantId, automationId, limit) =>
        Promise.resolve(
          runs
            .filter((r) => r.tenantId === tenantId && r.automationId === automationId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, limit),
        ),

      countSince: (tenantId, automationId, since) =>
        Promise.resolve(
          runs.filter(
            (r) =>
              r.tenantId === tenantId && r.automationId === automationId && r.createdAt >= since,
          ).length,
        ),

      update(tenantId, id, patch: AutomationRunPatch) {
        const i = runs.findIndex((r) => r.tenantId === tenantId && r.id === id);
        const { release, ...campos } = patch;
        runs[i] = {
          ...runs[i]!,
          ...campos,
          ...(release === true ? { lockedBy: null, lockedAt: null } : {}),
          updatedAt: new Date(runs[i]!.updatedAt.getTime() + 1),
        };
        return Promise.resolve(runs[i]!);
      },

      claimDue(workerId, now, limit, staleAfterMs) {
        const pegos: DueRunRef[] = [];
        for (const [i, r] of runs.entries()) {
          if (pegos.length >= limit) break;
          if (r.status !== 'pending' && r.status !== 'waiting') continue;
          if (r.wakeAt > now) continue;
          const abandonada =
            r.lockedAt !== null && now.getTime() - r.lockedAt.getTime() >= staleAfterMs;
          if (r.lockedBy !== null && !abandonada) continue;

          runs[i] = { ...r, lockedBy: workerId, lockedAt: now };
          pegos.push({ id: r.id, tenantId: r.tenantId, automationId: r.automationId });
        }
        return Promise.resolve(pegos);
      },
    },

    automationRunSteps: {
      record(step: NewRunStep) {
        seq += 1;
        steps.push({
          id: `step-mem-${seq}`,
          tenantId: step.tenantId,
          runId: step.runId,
          nodeId: step.nodeId,
          kind: step.kind,
          outcome: step.outcome,
          detail: step.detail,
          at: new Date(2026, 8, 3, 0, 0, seq),
        });
        return Promise.resolve();
      },

      listByRun: (tenantId, runId) =>
        Promise.resolve(steps.filter((r) => r.tenantId === tenantId && r.runId === runId)),
    },
  };
}

import type {
  AutomationRunPatch,
  AutomationRunRecord,
  AutomationRunRepository,
  AutomationRunStepRepository,
  DueRunRef,
  NewAutomationRun,
  NewRunStep,
  RunStepRecord,
} from './automationRunRepository.js';

type Row = AutomationRunRecord & { lockedBy: string | null; lockedAt: Date | null };

/**
 * Fake in-memory das execuções (§5.18). Fora do build.
 *
 * `claimDue` imita a reivindicação de verdade: carimba quem está vencido e sem dono, devolve
 * só ids, e recupera o que ficou carimbado tempo demais. Sem isso, o teste de "dois relógios
 * não pegam a mesma execução" provaria só que o fake é permissivo.
 */
export function fakeAutomationRunRepository(): AutomationRunRepository & { rows: Row[] } {
  const rows: Row[] = [];
  let seq = 0;

  return {
    rows,

    enqueue(run: NewAutomationRun) {
      if (
        run.idempotencyKey !== null &&
        rows.some(
          (r) =>
            r.tenantId === run.tenantId &&
            r.automationId === run.automationId &&
            r.idempotencyKey === run.idempotencyKey,
        )
      ) {
        return Promise.resolve(null);
      }
      seq += 1;
      const row: Row = {
        id: `run-${seq}`,
        tenantId: run.tenantId,
        automationId: run.automationId,
        triggerRef: run.triggerRef,
        idempotencyKey: run.idempotencyKey,
        status: 'pending',
        currentNodeId: run.startNodeId ?? null,
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
      rows.push(row);
      return Promise.resolve(row);
    },

    findById: (tenantId, id) =>
      Promise.resolve(rows.find((r) => r.tenantId === tenantId && r.id === id) ?? null),

    listByAutomation: (tenantId, automationId, limit) =>
      Promise.resolve(
        rows
          .filter((r) => r.tenantId === tenantId && r.automationId === automationId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit),
      ),

    countSince: (tenantId, automationId, since) =>
      Promise.resolve(
        rows.filter(
          (r) => r.tenantId === tenantId && r.automationId === automationId && r.createdAt >= since,
        ).length,
      ),

    update(tenantId, id, patch: AutomationRunPatch) {
      const i = rows.findIndex((r) => r.tenantId === tenantId && r.id === id);
      const { release, ...campos } = patch;
      rows[i] = {
        ...rows[i]!,
        ...campos,
        ...(release === true ? { lockedBy: null, lockedAt: null } : {}),
        updatedAt: new Date(rows[i]!.updatedAt.getTime() + 1),
      };
      return Promise.resolve(rows[i]!);
    },

    claimDue(workerId, now, limit, staleAfterMs) {
      const pegos: DueRunRef[] = [];
      for (const [i, r] of rows.entries()) {
        if (pegos.length >= limit) break;
        if (r.status !== 'pending' && r.status !== 'waiting') continue;
        if (r.wakeAt > now) continue;
        const abandonada =
          r.lockedAt !== null && now.getTime() - r.lockedAt.getTime() >= staleAfterMs;
        if (r.lockedBy !== null && !abandonada) continue;

        rows[i] = { ...r, lockedBy: workerId, lockedAt: now };
        pegos.push({ id: r.id, tenantId: r.tenantId, automationId: r.automationId });
      }
      return Promise.resolve(pegos);
    },
  };
}

/** Fake do log passo a passo (AU-06). Fora do build. */
export function fakeAutomationRunStepRepository(): AutomationRunStepRepository & {
  rows: (RunStepRecord & { tenantId: string; runId: string })[];
} {
  const rows: (RunStepRecord & { tenantId: string; runId: string })[] = [];
  let seq = 0;

  return {
    rows,

    record(step: NewRunStep) {
      seq += 1;
      rows.push({
        id: `step-${seq}`,
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
      Promise.resolve(rows.filter((r) => r.tenantId === tenantId && r.runId === runId)),
  };
}

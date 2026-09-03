import type {
  AutomationRunPatch,
  AutomationRunRecord,
  AutomationRunRepository,
  AutomationRunStepRepository,
  DueRunRef,
  NewAutomationRun,
  NewRunStep,
  RunStatus,
  RunStepRecord,
} from '@expedition/application';
import type { Prisma } from '../generated/prisma/client.js';
import type { AutomationRun as PrismaRun } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * §5.18 — as execuções no banco (AU-04, AU-11, AU-12).
 *
 * Tudo passa pelo client escopado, **menos a reivindicação**: o motor roda fora de requisição
 * e pergunta "o que está vencido, em qualquer tenant?". Esse é o único método aqui que usa o
 * client cru, e ele devolve só ids — ver `claimDue`.
 */
export function prismaAutomationRunRepository(base: PrismaClient): AutomationRunRepository {
  return {
    async enqueue(run: NewAutomationRun): Promise<AutomationRunRecord | null> {
      try {
        const row = await tenantClient(base, run.tenantId).automationRun.create({
          data: {
            tenantId: run.tenantId,
            automationId: run.automationId,
            triggerRef: run.triggerRef as Prisma.InputJsonValue,
            idempotencyKey: run.idempotencyKey,
            variables: run.variables as Prisma.InputJsonValue,
            wakeAt: run.wakeAt,
          },
        });
        return toRecord(row);
      } catch (error) {
        // AU-12: a chave já existia — a varredura passou de novo pela mesma saída, e isso é o
        // desenho funcionando, não erro. Qualquer outra falha continua subindo.
        if (violouUnique(error)) return null;
        throw error;
      }
    },

    async findById(tenantId: string, id: string): Promise<AutomationRunRecord | null> {
      const row = await tenantClient(base, tenantId).automationRun.findFirst({ where: { id } });
      return row ? toRecord(row) : null;
    },

    async listByAutomation(
      tenantId: string,
      automationId: string,
      limit: number,
    ): Promise<AutomationRunRecord[]> {
      const rows = await tenantClient(base, tenantId).automationRun.findMany({
        where: { automationId },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
      });
      return rows.map(toRecord);
    },

    async countSince(tenantId: string, automationId: string, since: Date): Promise<number> {
      return tenantClient(base, tenantId).automationRun.count({
        where: { automationId, createdAt: { gte: since } },
      });
    },

    async update(
      tenantId: string,
      id: string,
      patch: AutomationRunPatch,
    ): Promise<AutomationRunRecord> {
      const row = await tenantClient(base, tenantId).automationRun.update({
        where: { id },
        data: {
          ...(patch.status === undefined ? {} : { status: patch.status }),
          ...(patch.currentNodeId === undefined ? {} : { currentNodeId: patch.currentNodeId }),
          ...(patch.variables === undefined
            ? {}
            : { variables: patch.variables as Prisma.InputJsonValue }),
          ...(patch.wakeAt === undefined ? {} : { wakeAt: patch.wakeAt }),
          ...(patch.stepsTaken === undefined ? {} : { stepsTaken: patch.stepsTaken }),
          ...(patch.attempts === undefined ? {} : { attempts: patch.attempts }),
          ...(patch.lastError === undefined ? {} : { lastError: patch.lastError }),
          ...(patch.release === true ? { lockedBy: null, lockedAt: null } : {}),
        },
      });
      return toRecord(row);
    },

    /**
     * **A reivindicação — o único caminho sem escopo de tenant deste arquivo.**
     *
     * Duas instruções em vez de `SELECT ... FOR UPDATE SKIP LOCKED`, porque SQL cru não passa
     * pela Prisma Client Extension e o role do Prisma ignora a RLS: uma consulta crua sem
     * `WHERE tenant_id` lê a base inteira, e o verificador `check:raw-sql` existe justamente
     * para isso não voltar a acontecer. O `updateMany` carimba quem está vencido e sem dono —
     * dois processos não carimbam a mesma linha, porque o segundo já não a encontra livre.
     *
     * `staleAfterMs` devolve para a fila o que ficou carimbado por um processo que morreu no
     * meio: sem isso, um deploy no instante errado deixaria a execução presa para sempre.
     *
     * A leitura seguinte traz **só ids**. Executar volta ao client escopado, com o tenant da
     * própria linha — é o que impede este caminho de virar porta lateral para outro tenant.
     */
    async claimDue(
      workerId: string,
      now: Date,
      limit: number,
      staleAfterMs: number,
    ): Promise<readonly DueRunRef[]> {
      const abandonadaAntesDe = new Date(now.getTime() - staleAfterMs);

      const candidatas = await base.automationRun.findMany({
        where: {
          status: { in: ['pending', 'waiting'] },
          wakeAt: { lte: now },
          OR: [{ lockedBy: null }, { lockedAt: { lt: abandonadaAntesDe } }],
        },
        select: { id: true },
        orderBy: [{ wakeAt: 'asc' }],
        take: limit,
      });
      if (candidatas.length === 0) return [];

      await base.automationRun.updateMany({
        where: {
          id: { in: candidatas.map((c) => c.id) },
          // Repetido de propósito: entre a leitura e a escrita, outro processo pode ter
          // carimbado. Quem chega segundo atualiza zero linhas e não leva a execução.
          OR: [{ lockedBy: null }, { lockedAt: { lt: abandonadaAntesDe } }],
        },
        data: { lockedBy: workerId, lockedAt: now },
      });

      const minhas = await base.automationRun.findMany({
        where: { id: { in: candidatas.map((c) => c.id) }, lockedBy: workerId, lockedAt: now },
        select: { id: true, tenantId: true, automationId: true },
      });
      return minhas;
    },
  };
}

/** AU-06 — o log passo a passo. Só escreve e lê: não tem update nem delete, como a trilha. */
export function prismaAutomationRunStepRepository(base: PrismaClient): AutomationRunStepRepository {
  return {
    async record(step: NewRunStep): Promise<void> {
      await tenantClient(base, step.tenantId).automationRunStep.create({
        data: {
          tenantId: step.tenantId,
          runId: step.runId,
          nodeId: step.nodeId,
          kind: step.kind,
          outcome: step.outcome,
          detail: step.detail as Prisma.InputJsonValue,
        },
      });
    },

    async listByRun(tenantId: string, runId: string): Promise<RunStepRecord[]> {
      const rows = await tenantClient(base, tenantId).automationRunStep.findMany({
        where: { runId },
        orderBy: [{ at: 'asc' }],
      });
      return rows.map((row) => ({
        id: row.id,
        nodeId: row.nodeId,
        kind: row.kind,
        outcome: row.outcome,
        detail: (row.detail ?? {}) as Record<string, unknown>,
        at: row.at,
      }));
    },
  };
}

function toRecord(row: PrismaRun): AutomationRunRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    automationId: row.automationId,
    triggerRef: (row.triggerRef ?? {}) as Record<string, unknown>,
    idempotencyKey: row.idempotencyKey,
    status: row.status as RunStatus,
    currentNodeId: row.currentNodeId,
    variables: (row.variables ?? {}) as Record<string, unknown>,
    wakeAt: row.wakeAt,
    stepsTaken: row.stepsTaken,
    attempts: row.attempts,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** P2002 é violação de unique no Prisma. Sem o campo `code`, o erro não é dele. */
function violouUnique(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

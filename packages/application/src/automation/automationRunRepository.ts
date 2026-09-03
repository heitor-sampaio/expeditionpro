/**
 * §5.18 — a execução de uma automação, e o log dela (AU-04, AU-06, AU-11).
 *
 * Uma execução é uma linha que atravessa o tempo: nasce quando o gatilho dispara, anda até
 * acabar ou até uma espera, dorme, e é retomada depois. Guardar isso em tabela — em vez de
 * segurar na memória do processo — é o que faz um deploy no meio de uma espera de três dias
 * não perder a espera.
 */

export type RunStatus = 'pending' | 'waiting' | 'done' | 'failed' | 'cancelled';

export interface AutomationRunRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly automationId: string;
  /** O que disparou: ids da conversa, da oportunidade, da inscrição. */
  readonly triggerRef: Record<string, unknown>;
  readonly idempotencyKey: string | null;
  readonly status: RunStatus;
  /** O nó que a execução vai executar a seguir. `null` quer dizer "ainda no começo". */
  readonly currentNodeId: string | null;
  readonly variables: Record<string, unknown>;
  readonly wakeAt: Date;
  readonly stepsTaken: number;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewAutomationRun {
  readonly tenantId: string;
  readonly automationId: string;
  readonly triggerRef: Record<string, unknown>;
  /** AU-12: presente só no gatilho temporal, que é varrido e passaria de novo pela mesma saída. */
  readonly idempotencyKey: string | null;
  readonly variables: Record<string, unknown>;
  readonly wakeAt: Date;
}

export interface AutomationRunPatch {
  readonly status?: RunStatus;
  readonly currentNodeId?: string | null;
  readonly variables?: Record<string, unknown>;
  readonly wakeAt?: Date;
  readonly stepsTaken?: number;
  readonly attempts?: number;
  readonly lastError?: string | null;
  /** Devolver a execução para a fila é soltar a reivindicação. */
  readonly release?: boolean;
}

/**
 * O que o motor recebe do achado sem escopo: **só ids**. Executar volta ao client escopado,
 * com o tenant da própria linha — ver `claimDue`.
 */
export interface DueRunRef {
  readonly id: string;
  readonly tenantId: string;
  readonly automationId: string;
}

export interface AutomationRunRepository {
  /**
   * `null` quando a chave de idempotência já existia — o disparo era duplo, e a varredura
   * pode passar de novo pela mesma saída sem consequência (AU-12).
   */
  enqueue(run: NewAutomationRun): Promise<AutomationRunRecord | null>;
  findById(tenantId: string, id: string): Promise<AutomationRunRecord | null>;
  listByAutomation(
    tenantId: string,
    automationId: string,
    limit: number,
  ): Promise<AutomationRunRecord[]>;
  /** AU-05: quantas execuções esta automação abriu na última hora. */
  countSince(tenantId: string, automationId: string, since: Date): Promise<number>;
  update(tenantId: string, id: string, patch: AutomationRunPatch): Promise<AutomationRunRecord>;

  /**
   * **O único caminho do sistema que atravessa tenants de propósito.**
   *
   * O motor roda fora de requisição e não tem tenant: ele precisa perguntar "o que está
   * vencido, em qualquer tenant?". Carimba a reivindicação num lote e devolve **só ids** —
   * quem carimbar primeiro leva a linha, e `staleAfterMs` devolve para a fila o que ficou
   * carimbado por um processo que morreu no meio.
   *
   * Nada além de id, tenant e automação sai daqui. É o que impede este caminho de virar uma
   * porta lateral para ler dado de outro tenant.
   */
  claimDue(
    workerId: string,
    now: Date,
    limit: number,
    staleAfterMs: number,
  ): Promise<readonly DueRunRef[]>;
}

/** AU-06 — cada nó por onde a execução passou, e o que aconteceu nele. */
export interface RunStepRecord {
  readonly id: string;
  readonly nodeId: string;
  readonly kind: string;
  readonly outcome: string;
  readonly detail: Record<string, unknown>;
  readonly at: Date;
}

export interface NewRunStep {
  readonly tenantId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly kind: string;
  readonly outcome: string;
  readonly detail: Record<string, unknown>;
}

export interface AutomationRunStepRepository {
  record(step: NewRunStep): Promise<void>;
  listByRun(tenantId: string, runId: string): Promise<RunStepRecord[]>;
}

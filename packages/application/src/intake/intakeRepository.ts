import type { MappedIntake } from '@expedition/domain';

/**
 * Ports do webhook (§5.7). A `ApiKeyRepository` resolve a credencial de máquina
 * (§3.9) — a verificação não passa pela extension de tenant, porque é ela que
 * descobre o tenant. A `IntakeRepository` guarda o corpo cru imutável + o normalizado
 * e serve a fila de alocação.
 */

export interface VerifiedApiKey {
  readonly keyId: string;
  readonly tenantId: string;
}

export interface NewApiKey {
  readonly tenantId: string;
  readonly name: string;
  readonly scopes: readonly string[];
  readonly environment: string; // live | test
}

export interface ApiKeyRecord {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly scopes: readonly string[];
  readonly lastUsedAt: Date | null;
  readonly useCount: number;
  readonly revokedAt: Date | null;
}

/** O token completo aparece UMA vez, na criação (§3.9). Depois, só o hash fica guardado. */
export interface CreatedApiKey {
  readonly token: string;
  readonly record: ApiKeyRecord;
}

export interface ApiKeyRepository {
  /**
   * IN-22: valida o token (hash) para o slug e o escopo. Retorna a chave verificada,
   * ou null em qualquer falha (ausente, inválida, revogada, expirada, sem escopo, de
   * outro tenant) — a borda responde 401 sem distinguir o motivo (§3.9).
   */
  verify(token: string, tenantSlug: string, requiredScope: string): Promise<VerifiedApiKey | null>;
  /** Marca uso (last_used_at, use_count) — sem bloquear o caminho quente. */
  touch(keyId: string): Promise<void>;
  /** IN-21: cria a chave (gera token + hash), devolvendo o valor completo uma vez. */
  create(key: NewApiKey): Promise<CreatedApiKey>;
  list(tenantId: string): Promise<ApiKeyRecord[]>;
  /** Revoga individualmente (IN-21). false se não existe no tenant. */
  revoke(tenantId: string, keyId: string, revokedBy: string): Promise<boolean>;
}

export interface NewIntakeEvent {
  readonly tenantId: string;
  readonly source: string;
  readonly externalId: string | null;
  readonly payload: unknown; // corpo cru
  readonly normalized: unknown | null; // saída do perfil
  readonly formId: string | null;
  /** IN-20: roteiro resolvido pelo mapa form_id→roteiro na chegada; null se não há mapa. */
  readonly itineraryId: string | null;
  readonly submittedAt: string | null;
  readonly status: string; // needs_allocation | error
  readonly error: string | null;
  readonly isTest: boolean;
}

export interface IntakeEventRecord {
  readonly id: string;
  readonly source: string;
  readonly externalId: string | null;
  readonly formId: string | null;
  readonly status: string;
  readonly error: string | null;
}

/** Item da fila de alocação (§5.7.2) — resumo do normalizado, CPF mascarado (SEC-04). */
export interface IntakeQueueItem {
  readonly id: string;
  readonly externalId: string | null;
  readonly formId: string | null;
  readonly status: string;
  readonly responsibleName: string;
  readonly responsibleCpf: string; // mascarado
  readonly companionCount: number;
  readonly desiredDate: string | null; // ISO
  readonly receivedAt: string; // ISO datetime
  readonly warnings: readonly string[];
  /** IN-05: causa da falha quando `status === 'error'`; null caso contrário. */
  readonly error: string | null;
  /** IN-20: roteiro resolvido pelo mapa form_id→roteiro; null se não há mapa. */
  readonly itineraryId: string | null;
  /** `portal` (app do cliente) ou a origem do formulário — muda o que a tela oferece. */
  readonly source: string;
  /** §5.8: no pedido do app, a saída que o **cliente** escolheu; a tela já vem preenchida. */
  readonly chosenGroupId: string | null;
}

/** Intake com o normalizado desserializado — para a alocação (§5.7.2). */
export interface IntakeForAllocation {
  readonly id: string;
  readonly status: string;
  readonly normalized: MappedIntake;
  /** `site`/`wp_flat_v1`… ou `portal` — a origem decide o caminho e o cashback (§5.8). */
  readonly source: string;
  /** Corpo cru: no pedido do portal traz os ids já escolhidos pelo cliente. */
  readonly payload: unknown;
}

export interface IntakeAllocation {
  readonly groupId: string;
  readonly bookingId: string;
  readonly allocatedBy: string;
  readonly allocatedAt: Date;
}

/** §5.8: pedido do portal aguardando revisão, do jeito que o cliente precisa ver. */
export interface PortalRequestRecord {
  readonly id: string;
  readonly groupId: string;
  readonly participantCount: number;
  readonly requestedAt: string;
}

export interface IntakeRepository {
  /** IN-02: dedup por (tenant, source, external_id). */
  findByExternalId(
    tenantId: string,
    source: string,
    externalId: string,
  ): Promise<IntakeEventRecord | null>;
  store(event: NewIntakeEvent): Promise<IntakeEventRecord>;
  /** §5.8: pedidos do portal feitos para um grupo e ainda pendentes (a saída sumiu?). */
  listPendingRequestsByGroup(tenantId: string, groupId: string): Promise<{ id: string }[]>;
  /** §5.8: pedidos do portal do próprio cliente que ainda aguardam revisão. */
  listPortalRequestsByHead(
    tenantId: string,
    headCustomerId: string,
  ): Promise<PortalRequestRecord[]>;
  /** IN-17: fila (não alocados/descartados) com resumo para o admin decidir. */
  listQueue(tenantId: string): Promise<IntakeQueueItem[]>;
  /** Carrega o intake com o normalizado desserializado, para alocar (§5.7.2). */
  findForAllocation(tenantId: string, intakeId: string): Promise<IntakeForAllocation | null>;
  /** IN-18: marca `allocated`, gravando grupo, booking, quem/quando. */
  markAllocated(tenantId: string, intakeId: string, allocation: IntakeAllocation): Promise<void>;
  /** IN-19: descarta com motivo. */
  markDiscarded(tenantId: string, intakeId: string, reason: string): Promise<void>;
  /** IN-05: carrega a inscrição em `error` com o payload cru + `source`, para reprocessar. */
  findForReprocess(
    tenantId: string,
    intakeId: string,
  ): Promise<{ id: string; status: string; source: string; payload: unknown } | null>;
  /** IN-05: reprocessamento bem-sucedido → volta à fila (`needs_allocation`) com o normalizado. */
  markReprocessed(
    tenantId: string,
    intakeId: string,
    result: { normalized: unknown; formId: string | null; submittedAt: string | null },
  ): Promise<void>;
  /** IN-05: reprocessamento ainda falho → mantém `error`, atualiza a mensagem. */
  markError(tenantId: string, intakeId: string, error: string): Promise<void>;
}

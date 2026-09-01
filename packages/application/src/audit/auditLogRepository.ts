import type { Actor } from '../context.js';

/**
 * Trilha de auditoria (§3.2.1 · A09 · SEC-04). Append-only: uma linha por ação
 * sensível — reorganização de família, merge, acesso a CPF completo, chave de API.
 * Nunca é editada nem apagada (retenção de 2 anos é purga por data, não soft delete).
 *
 * `diff` guarda o que mudou de forma legível na investigação (ex.: `{ from, to }`),
 * nunca dado pessoal cru — CPF, se entrar, entra mascarado.
 */

export interface NewAuditLogEntry {
  readonly tenantId: string;
  readonly actorUserId: string | null;
  readonly entity: string;
  readonly entityId: string;
  readonly action: string;
  readonly diff: Record<string, unknown>;
}

export interface AuditLogEntry {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly entity: string;
  readonly entityId: string;
  readonly action: string;
  readonly diff: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface AuditLogRepository {
  /** Grava um evento de auditoria. Escrita append-only. */
  record(entry: NewAuditLogEntry): Promise<AuditLogEntry>;
  /** Histórico de uma entidade específica, mais recente primeiro. */
  listByEntity(tenantId: string, entity: string, entityId: string): Promise<AuditLogEntry[]>;
}

/**
 * `actor_user_id` do PRD: o usuário por trás da ação quando existe. Integração (chave
 * de API) e sistema não têm usuário — ficam nulos, e o `action`/`diff` carregam o resto.
 */
export function actorUserId(actor: Actor): string | null {
  switch (actor.kind) {
    case 'team':
    case 'customer':
      return actor.userId;
    case 'integration':
    case 'system':
      return null;
  }
}

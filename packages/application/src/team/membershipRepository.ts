import type { TeamRole } from '../context.js';

/**
 * SEC-17 — quem tem acesso ao sistema, e com que papel.
 *
 * A tabela existia desde a migration inicial e **nunca era lida**: o papel vinha só do
 * `app_metadata` do token. Isso significava que não havia como listar quem entra, não
 * havia como tirar o acesso de ninguém (só pelo painel do Supabase), e um token já
 * emitido continuava valendo até expirar — até uma hora de acesso para quem foi desligado.
 *
 * Agora esta tabela é a fonte da verdade do papel, consultada a cada requisição de equipe.
 * O token continua provando **quem** é a pessoa; o banco decide **o que** ela pode. É o
 * que faz o corte valer no ato, e faz uma troca de papel valer sem esperar novo login.
 */

export interface MembershipRecord {
  readonly userId: string;
  /** Guardado aqui para a lista ser legível sem uma chamada ao Supabase por linha. */
  readonly email: string | null;
  readonly role: TeamRole;
  readonly createdAt: Date;
}

export interface MembershipRepository {
  /** Papel vigente no tenant. `null` = sem acesso. Caminho quente: um índice por (tenant, user). */
  findByUser(tenantId: string, userId: string): Promise<MembershipRecord | null>;
  list(tenantId: string): Promise<readonly MembershipRecord[]>;
  /** Idempotente: reconvidar alguém atualiza o papel em vez de duplicar a linha. */
  grant(
    tenantId: string,
    userId: string,
    email: string | null,
    role: TeamRole,
  ): Promise<MembershipRecord>;
  /** `false` quando não havia acesso — a rota responde 404 em vez de fingir sucesso. */
  revoke(tenantId: string, userId: string): Promise<boolean>;
}

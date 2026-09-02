import { actorUserId, type AuditLogRepository } from '../audit/auditLogRepository.js';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { assertOwnerReach, requireTeamAdmin } from './teamGuards.js';
import type { RequestContext } from '../context.js';
import type { MembershipRepository } from './membershipRepository.js';

export interface RevokeTeamAccessDeps {
  readonly memberships: MembershipRepository;
  readonly audit: AuditLogRepository;
}

export interface RevokeTeamAccessCommand {
  readonly userId: string;
}

/**
 * SEC-17 — tira o acesso de alguém ao sistema.
 *
 * O corte vale na requisição seguinte, não quando o token expirar: o papel é lido do banco
 * a cada requisição de equipe (ver `membershipRepository`). Era o furo que sobrava — desligar
 * alguém dependia do painel do Supabase, e mesmo assim o token na mão dela seguia valendo.
 *
 * Não se tira o próprio acesso. Um owner sozinho que se remove tranca a porta por dentro:
 * ninguém no tenant consegue mais convidar ninguém, e a saída passa a ser o painel do
 * Supabase — exatamente o que este caso de uso existe para evitar.
 */
export async function revokeTeamAccess(
  deps: RevokeTeamAccessDeps,
  ctx: RequestContext,
  command: RevokeTeamAccessCommand,
): Promise<void> {
  requireTeamAdmin(ctx, 'Tirar acesso');
  const { actor } = ctx;

  if (command.userId === actor.userId) {
    throw new BusinessRuleError('cannot_revoke_self', 'Não é possível tirar o próprio acesso');
  }

  // Busca antes de apagar: a trilha precisa do papel e do e-mail que deixaram de existir.
  const alvo = await deps.memberships.findByUser(ctx.tenantId, command.userId);
  if (!alvo) throw new NotFoundError('membro da equipe');

  assertOwnerReach(actor, alvo.role);

  await deps.memberships.revoke(ctx.tenantId, command.userId);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'membership',
    entityId: command.userId,
    action: 'team_member.revoke',
    diff: { email: alvo.email, role: alvo.role },
  });
}

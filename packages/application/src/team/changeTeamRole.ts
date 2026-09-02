import { actorUserId, type AuditLogRepository } from '../audit/auditLogRepository.js';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { assertOwnerReach, requireTeamAdmin } from './teamGuards.js';
import type { RequestContext, TeamRole } from '../context.js';
import type { MembershipRepository } from './membershipRepository.js';

export interface ChangeTeamRoleDeps {
  readonly memberships: MembershipRepository;
  readonly audit: AuditLogRepository;
}

export interface ChangeTeamRoleCommand {
  readonly userId: string;
  readonly role: TeamRole;
}

/**
 * SEC-18 — troca o papel de quem já está na equipe.
 *
 * Não havia caminho nenhum para isso: convidar de novo não resolve (o Supabase recusa
 * recriar e-mail existente, 409/422), e tirar o acesso e reconvidar também não, porque o
 * login continua lá. A saída era UPDATE à mão no banco.
 *
 * O papel novo vale a partir da requisição seguinte, como a remoção: desde o SEC-17 quem
 * decide o que a pessoa pode é a linha de acesso, não o token. Por isso a troca mexe só
 * aqui — `app_metadata.role` continua no login do Supabase decidindo a **audiência**
 * (equipe ou cliente), e não o papel dentro da equipe.
 *
 * Ninguém troca o próprio papel: seria promover a si mesmo, que é a forma mais direta de
 * escalada que existe.
 */
export async function changeTeamRole(
  deps: ChangeTeamRoleDeps,
  ctx: RequestContext,
  command: ChangeTeamRoleCommand,
): Promise<void> {
  requireTeamAdmin(ctx, 'Trocar o papel de um membro');
  const { actor } = ctx;

  if (command.userId === actor.userId) {
    throw new BusinessRuleError('cannot_change_own_role', 'Não é possível trocar o próprio papel');
  }

  const alvo = await deps.memberships.findByUser(ctx.tenantId, command.userId);
  if (!alvo) throw new NotFoundError('membro da equipe');

  assertOwnerReach(actor, alvo.role, command.role);

  // Trocar para o mesmo papel não é evento: trilha com ruído não é lida.
  if (alvo.role === command.role) return;

  await deps.memberships.grant(ctx.tenantId, command.userId, alvo.email, command.role);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'membership',
    entityId: command.userId,
    action: 'team_member.change_role',
    diff: { email: alvo.email, role: { from: alvo.role, to: command.role } },
  });
}

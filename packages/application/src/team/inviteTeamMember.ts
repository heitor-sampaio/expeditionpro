import { actorUserId } from '../audit/auditLogRepository.js';
import type { MembershipRepository } from './membershipRepository.js';
import type { TeamRole } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import { BusinessRuleError, ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { AuthAdminGateway, InvitedUser } from './authAdminGateway.js';

/**
 * §3.7 — convida um membro de equipe. Cria o usuário no Supabase Auth com
 * `app_metadata.{tenant_id, role}` (o que a RLS lê). Regras de segurança:
 *  - só `owner`/`admin` convidam;
 *  - o `tenant_id` vem do contexto do inviter, nunca do corpo (isolamento);
 *  - papel concedido restrito a `admin`/`operator`/`viewer` — nunca `owner`
 *    (sem escalonamento por convite) nem `customer` (outra audiência).
 */

const GRANTABLE_ROLES = new Set(['admin', 'operator', 'viewer']);

export interface InviteTeamMemberDeps {
  readonly authAdmin: AuthAdminGateway;
  readonly memberships: MembershipRepository;
  readonly audit: AuditLogRepository;
}

export interface InviteTeamMemberCommand {
  readonly email: string;
  readonly role: string;
}

export async function inviteTeamMember(
  deps: InviteTeamMemberDeps,
  ctx: RequestContext,
  command: InviteTeamMemberCommand,
): Promise<InvitedUser> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Convidar membro exige owner ou admin');
  }
  if (!GRANTABLE_ROLES.has(command.role)) {
    throw new BusinessRuleError(
      'invalid_role',
      'Papel concedido deve ser admin, operator ou viewer',
    );
  }

  const invited = await deps.authAdmin.inviteTeamMember({
    email: command.email.trim(),
    tenantId: ctx.tenantId,
    role: command.role,
  });

  /*
   * SEC-17 — a linha de acesso é o que a lista lê e o que a revogação apaga, e é ela que
   * o resolvedor de contexto consulta a cada requisição. Sem gravá-la aqui, o papel
   * viveria só no `app_metadata` do login: invisível para o sistema e impossível de tirar
   * sem o painel do Supabase. Gravada depois do convite: e-mail já cadastrado é recusado
   * pelo Supabase, e a recusa não pode deixar acesso órfão.
   */
  await deps.memberships.grant(
    ctx.tenantId,
    invited.userId,
    command.email.trim(),
    command.role as TeamRole,
  );

  /*
   * A09 — convite **cria conta de acesso**. Quem concedeu, para quem e com qual papel é
   * exatamente o que se quer saber quando alguém aparece no sistema sem explicação. Note
   * que o `actionLink` (magic link válido) fica de fora da trilha de propósito: é
   * credencial, não é registro.
   */
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'membership',
    entityId: invited.userId,
    action: 'team_member.invite',
    diff: { email: command.email.trim(), role: command.role },
  });

  return invited;
}

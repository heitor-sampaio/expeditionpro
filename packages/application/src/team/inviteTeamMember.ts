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

  return deps.authAdmin.inviteTeamMember({
    email: command.email.trim(),
    tenantId: ctx.tenantId,
    role: command.role,
  });
}

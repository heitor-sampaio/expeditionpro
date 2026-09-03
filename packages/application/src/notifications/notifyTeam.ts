import { RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { MembershipRepository } from '../team/membershipRepository.js';
import type { TeamNoticeGateway } from './notificationGateway.js';

export interface NotifyTeamDeps {
  readonly memberships: MembershipRepository;
  readonly notifications: TeamNoticeGateway;
}

export interface NotifyTeamCommand {
  readonly text: string;
}

/**
 * AU-13 — avisar a equipe.
 *
 * A lista de destinatários sai de `memberships`, e é **sempre** a do tenant do contexto. É a
 * regra que importa aqui: um aviso de automação carrega nome e telefone de cliente, e mandar
 * para a lista errada não é incômodo, é vazamento.
 *
 * Quem não tem e-mail cadastrado simplesmente fica de fora, e equipe inteira sem e-mail não é
 * erro — é uma operação que ainda não configurou isso. Falhar aí derrubaria a automação por
 * um motivo que não é dela.
 */
export async function notifyTeam(
  deps: NotifyTeamDeps,
  ctx: RequestContext,
  command: NotifyTeamCommand,
): Promise<void> {
  const text = command.text.trim();
  if (text === '') throw new RequiredFieldError('texto do aviso');

  const equipe = await deps.memberships.list(ctx.tenantId);
  const to = equipe.map((m) => m.email).filter((email): email is string => email !== null);
  if (to.length === 0) return;

  await deps.notifications.sendTeamNotice({ to, text });
}

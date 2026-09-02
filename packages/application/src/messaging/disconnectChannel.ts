import { actorUserId } from '../audit/auditLogRepository.js';
import { requireTeamAdmin } from '../team/teamGuards.js';
import { NotFoundError } from '../errors.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { ChannelIntegrationRepository } from './channelIntegrationRepository.js';
import type { Channel } from './conversationRepository.js';

export interface DisconnectChannelCommand {
  readonly channel: Channel;
}

/**
 * AT-01 — desconecta o canal.
 *
 * Apaga a conexão, **não** as conversas: o histórico do que foi dito é registro, e sumir com
 * ele porque a instância trocou seria perder a memória da negociação. Reconectar volta a
 * receber no mesmo fio, porque a conversa é achada por `(canal, id do usuário no canal)`.
 */
export async function disconnectChannel(
  deps: {
    readonly integrations: ChannelIntegrationRepository;
    readonly audit: AuditLogRepository;
  },
  ctx: RequestContext,
  command: DisconnectChannelCommand,
): Promise<void> {
  requireTeamAdmin(ctx, 'desconectar um canal de mensagem');

  const removido = await deps.integrations.remove(ctx.tenantId, command.channel);
  if (!removido) throw new NotFoundError('canal conectado');

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'channel_integration',
    entityId: command.channel,
    action: 'channel_integration.disconnect',
    diff: { channel: command.channel },
  });
}

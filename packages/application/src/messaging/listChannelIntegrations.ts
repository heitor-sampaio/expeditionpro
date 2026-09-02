import { requireTeam } from '../audience.js';
import { toView } from './connectChannel.js';
import type { RequestContext } from '../context.js';
import type {
  ChannelIntegrationRepository,
  ChannelProvider,
} from './channelIntegrationRepository.js';
import type { Channel } from './conversationRepository.js';

export interface ChannelIntegrationView {
  readonly channel: Channel;
  readonly provider: ChannelProvider;
  readonly baseUrl: string;
  readonly externalAccountId: string;
  /** Os quatro últimos caracteres da chave. Nunca a chave. */
  readonly tokenPreview: string;
  readonly active: boolean;
  readonly connectedAt: Date;
}

/**
 * AT-01 — quais canais este tenant tem conectados.
 *
 * `requireTeam` e não `requireTeamAdmin`: quem atende precisa saber que o WhatsApp caiu para
 * entender por que parou de chegar mensagem. O que a listagem não mostra é a chave — nem para
 * o owner, porque ela não volta em claro de lugar nenhum depois de guardada.
 */
export async function listChannelIntegrations(
  deps: { readonly integrations: ChannelIntegrationRepository },
  ctx: RequestContext,
): Promise<ChannelIntegrationView[]> {
  requireTeam(ctx);
  const rows = await deps.integrations.list(ctx.tenantId);
  return rows.map(toView);
}

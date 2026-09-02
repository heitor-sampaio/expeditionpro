import { actorUserId } from '../audit/auditLogRepository.js';
import { requireTeamAdmin } from '../team/teamGuards.js';
import { RequiredFieldError } from '../errors.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type {
  ChannelIntegrationRepository,
  ChannelProvider,
} from './channelIntegrationRepository.js';
import type { Channel } from './conversationRepository.js';
import type { ChannelIntegrationView } from './listChannelIntegrations.js';

export interface ConnectChannelDeps {
  readonly integrations: ChannelIntegrationRepository;
  readonly audit: AuditLogRepository;
  /** Gerador do segredo de webhook; a infraestrutura injeta o aleatório de verdade. */
  readonly newSecret?: (() => string) | undefined;
}

export interface ConnectChannelCommand {
  readonly channel: Channel;
  readonly provider: ChannelProvider;
  readonly baseUrl: string;
  readonly externalAccountId: string;
  readonly accessToken: string;
}

export interface ConnectedChannel extends ChannelIntegrationView {
  /** Em claro **só na primeira conexão**; `null` ao reconectar, quando segue o mesmo. */
  readonly webhookToken: string | null;
}

/**
 * AT-01 — conecta o tenant a um canal de mensagem.
 *
 * Mesmo peso do gateway de pagamento (PG-01), e pela mesma razão: quem tem a chave da
 * instância manda mensagem **como a empresa**, para qualquer número da agenda. Por isso owner
 * ou admin, e por isso o segredo do webhook sai em claro uma única vez.
 *
 * Diferente do ASAAS, **não há checagem no provedor antes de guardar**: a Evolution não expõe
 * um "quem sou eu" estável entre versões de instância, e inventar uma chamada aqui amarraria o
 * caso de uso a um provedor. A chave errada aparece na primeira mensagem que não sai — e é por
 * isso que a fatia de envio traz o erro para a tela em vez de engolir.
 */
export async function connectChannel(
  deps: ConnectChannelDeps,
  ctx: RequestContext,
  command: ConnectChannelCommand,
): Promise<ConnectedChannel> {
  requireTeamAdmin(ctx, 'conectar um canal de mensagem');

  const accessToken = command.accessToken.trim();
  if (accessToken.length === 0) throw new RequiredFieldError('chave de API');

  const baseUrl = command.baseUrl.trim().replace(/\/+$/, '');
  // Endereço sem esquema viraria chamada relativa dentro do servidor — falha tarde e feio.
  if (!/^https?:\/\/\S+$/.test(baseUrl)) {
    throw new RequiredFieldError('endereço do provedor (começando com http:// ou https://)');
  }

  const externalAccountId = command.externalAccountId.trim();
  if (externalAccountId.length === 0) throw new RequiredFieldError('nome da instância');

  const existente = await deps.integrations.findByChannel(ctx.tenantId, command.channel);
  const novoSegredo = existente ? null : (deps.newSecret ?? defaultSecret)();

  const record = await deps.integrations.upsert({
    tenantId: ctx.tenantId,
    channel: command.channel,
    provider: command.provider,
    baseUrl,
    externalAccountId,
    accessToken,
    ...(novoSegredo === null ? {} : { webhookToken: novoSegredo }),
    connectedBy: actorUserId(ctx.actor),
  });

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'channel_integration',
    entityId: record.id,
    action: 'channel_integration.connect',
    // Sem a chave e sem o segredo: a trilha registra que houve conexão, não como entrar nela.
    diff: { channel: command.channel, provider: command.provider, baseUrl },
  });

  return { ...toView(record), webhookToken: novoSegredo };
}

/**
 * Fallback só para os testes de caso de uso; em produção a infraestrutura injeta `newSecret`
 * com `randomBytes` — segredo de webhook não sai daqui, e a aplicação não conhece crypto.
 */
let secretSeq = 0;
function defaultSecret(): string {
  secretSeq += 1;
  return `chk_test_${secretSeq}`;
}

/** Compartilhado com a listagem: a tela vê o bastante para conferir, nunca a chave. */
export function toView(record: {
  channel: Channel;
  provider: ChannelProvider;
  baseUrl: string;
  externalAccountId: string;
  accessToken: string;
  active: boolean;
  connectedAt: Date;
}): ChannelIntegrationView {
  return {
    channel: record.channel,
    provider: record.provider,
    baseUrl: record.baseUrl,
    externalAccountId: record.externalAccountId,
    tokenPreview: preview(record.accessToken),
    active: record.active,
    connectedAt: record.connectedAt,
  };
}

/**
 * Só os quatro últimos caracteres, e nunca a chave inteira: é o que permite conferir "colei a
 * chave certa" sem transformar a listagem num vazamento.
 */
function preview(token: string): string {
  return '••••' + token.slice(-4);
}

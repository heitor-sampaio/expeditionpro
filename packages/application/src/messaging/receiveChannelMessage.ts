import { ipIsAllowed, mapEvolutionEvent } from '@expedition/domain';
import { UnauthorizedError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { ChannelIntegrationRepository } from './channelIntegrationRepository.js';
import type { Channel, ConversationRepository } from './conversationRepository.js';

export interface ReceiveChannelMessageDeps {
  readonly integrations: ChannelIntegrationRepository;
  readonly conversations: ConversationRepository;
  readonly customers: CustomerRepository;
}

export interface ReceiveChannelMessageCommand {
  /** Segredo apresentado, quando o provedor consegue mandar um. Vazio quando não consegue. */
  readonly token: string;
  /** AT-02: de onde a conexão veio de verdade — o último salto, nunca o que o chamador diz. */
  readonly clientIp: string;
  /** Qual canal esta rota atende. Necessário para achar a conexão quando não há segredo. */
  readonly channel: Channel;
  readonly body: unknown;
}

export interface ReceiveOutcome {
  /** `false` = evento ignorado ou mensagem repetida. Nos dois casos a resposta é 200. */
  readonly handled: boolean;
}

const IGNORADO: ReceiveOutcome = { handled: false };

/**
 * AT-02..AT-06 — a mensagem que chega pelo webhook da Evolution.
 *
 * Três regras herdadas do webhook de pagamento, pelas mesmas razões:
 *
 * - **O segredo autentica, não a URL.** O endereço é público por natureza: o provedor precisa
 *   alcançá-lo sem sessão. Quando o provedor não consegue apresentar segredo nenhum — nem em
 *   cabeçalho, nem em corpo, nem no caminho —, o que resta é a **origem da conexão** (AT-02).
 * - **401, nunca 403.** O endereço traz o slug do tenant, e 403 confirmaria que aquele tenant
 *   existe e tem canal conectado — enumeração de clientes da plataforma, um chute por vez.
 * - **Ignorar responde 200.** Evento desconhecido e mensagem repetida não são erro; devolver
 *   erro faria o provedor reenviar em laço para sempre.
 *
 * E uma que é daqui: **nunca cria cliente.** O §5.7.2 é explícito — auto-merge silencioso
 * corrompe a base. Casar com um cliente existente pelo telefone é seguro e reversível; criar
 * um a partir de um "oi" no WhatsApp encheria a tabela que sustenta contrato e dinheiro.
 */
export async function receiveChannelMessage(
  deps: ReceiveChannelMessageDeps,
  ctx: RequestContext,
  command: ReceiveChannelMessageCommand,
): Promise<ReceiveOutcome> {
  const integration = await autenticar(deps, ctx, command);
  if (!integration) throw new UnauthorizedError('Webhook não autenticado');

  const evento = mapEvolutionEvent(command.body);
  if (evento.kind === 'ignored') return IGNORADO;

  // AT-03: a marca é o id da mensagem no provedor. Chega antes de qualquer escrita, porque
  // o reenvio é o caso comum, não a exceção.
  const jaTemos = await deps.conversations.findMessageByExternalId(ctx.tenantId, evento.externalId);
  if (jaTemos) return IGNORADO;

  const conversa =
    (await deps.conversations.findByChannelUser(
      ctx.tenantId,
      integration.channel,
      evento.channelUserId,
    )) ??
    (await deps.conversations.createConversation({
      tenantId: ctx.tenantId,
      channel: integration.channel,
      channelUserId: evento.channelUserId,
      displayName: evento.displayName,
      customerId: await clientePeloTelefone(deps, ctx, integration.channel, evento.channelUserId),
    }));

  await deps.conversations.addMessage({
    tenantId: ctx.tenantId,
    conversationId: conversa.id,
    externalId: evento.externalId,
    direction: evento.direction,
    body: evento.body,
    // Mensagem que chega não tem autor da equipe; a que sai pelo celular pareado também não
    // — quem respondeu foi alguém no aparelho, e o provedor não diz quem (AT-08).
    sentByUserId: null,
    payload: command.body,
    sentAt: evento.sentAt,
  });

  await deps.conversations.touchConversation(ctx.tenantId, conversa.id, {
    lastMessageAt: evento.sentAt,
    // Só o que entra conta como não lido: o que sai já foi visto por quem escreveu.
    incrementUnread: evento.direction === 'in',
    // O nome do WhatsApp muda quando a pessoa troca o perfil; vale sempre o mais recente.
    ...(evento.displayName === null ? {} : { displayName: evento.displayName }),
  });

  return { handled: true };
}

/**
 * AT-02 — quem pode escrever nesta caixa.
 *
 * Duas provas, e **uma basta**:
 *
 * - **o segredo**, quando o provedor consegue apresentá-lo. É a prova melhor: vale de qualquer
 *   lugar e não depende de onde o servidor do provedor está hospedado;
 * - **a origem da conexão**, quando ele não consegue. A equipe declara o endereço do servidor
 *   da instância, e só ele entra.
 *
 * Cerca vazia não libera ninguém: quem conectou o canal e não preencheu o campo continua
 * dependendo do segredo. O padrão de quem esquece de configurar é o fechado.
 */
async function autenticar(
  deps: ReceiveChannelMessageDeps,
  ctx: RequestContext,
  command: ReceiveChannelMessageCommand,
) {
  if (command.token !== '') {
    const porSegredo = await deps.integrations.findByWebhookToken(ctx.tenantId, command.token);
    if (porSegredo) return porSegredo;
  }

  const doCanal = await deps.integrations.findByChannel(ctx.tenantId, command.channel);
  if (doCanal?.active && ipIsAllowed(command.clientIp, doCanal.allowedIps)) return doCanal;
  return null;
}

/**
 * AT-06 — casa com um cliente existente, e **só quando não há dúvida**.
 *
 * Telefone repetido em duas fichas é comum aqui: o número do responsável costuma estar em
 * mais de uma pessoa da família. Escolher uma seria adivinhar, e adivinhar joga a conversa na
 * pessoa errada — a equipe vincula à mão, que é reversível. Fora do WhatsApp nem se tenta: o
 * id do Instagram e do Messenger é opaco e não é telefone.
 */
async function clientePeloTelefone(
  deps: ReceiveChannelMessageDeps,
  ctx: RequestContext,
  channel: string,
  channelUserId: string,
): Promise<string | null> {
  if (channel !== 'whatsapp') return null;
  const candidatos = await deps.customers.listByPhone(ctx.tenantId, channelUserId);
  return candidatos.length === 1 ? (candidatos[0]?.id ?? null) : null;
}

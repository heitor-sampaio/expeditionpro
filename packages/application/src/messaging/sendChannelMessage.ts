import { requireWriter } from '../audience.js';
import { BusinessRuleError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { ChannelIntegrationRepository } from './channelIntegrationRepository.js';
import type { ConversationRepository, MessageRecord } from './conversationRepository.js';
import type { MediaStore } from './mediaStore.js';
import type { MessagingGateway } from './messagingGateway.js';

export interface SendChannelMessageDeps {
  readonly conversations: ConversationRepository;
  readonly integrations: ChannelIntegrationRepository;
  readonly gateway: MessagingGateway;
  /** AT-13: o bucket onde o anexo enviado também fica, para o fio poder mostrá-lo. */
  readonly media: MediaStore;
  readonly clock: () => Date;
}

/** AT-13: o anexo que a equipe escolheu ou gravou. `base64` porque é como ele chega da tela. */
export interface OutboundAttachment {
  readonly kind: 'image' | 'video' | 'audio' | 'document';
  readonly mimeType: string;
  readonly fileName: string | null;
  readonly base64: string;
}

export interface SendChannelMessageCommand {
  readonly conversationId: string;
  /** Com anexo, vira legenda e pode ser vazio. Sem anexo, é a mensagem e é obrigatório. */
  readonly body: string;
  readonly media?: OutboundAttachment | undefined;
}

/** O que aparece no fio quando o anexo veio sem legenda. Mesmo vocabulário do que chega. */
const MARCADOR: Record<OutboundAttachment['kind'], string> = {
  image: '[imagem]',
  video: '[vídeo]',
  audio: '[áudio]',
  document: '[documento]',
};

/**
 * AT-08 — responder pela caixa.
 *
 * A ordem importa: **manda primeiro, grava depois**. O contrário deixaria no fio uma resposta
 * que o cliente nunca recebeu — numa caixa de atendimento esse é o pior erro possível, porque
 * a equipe passa a acreditar que respondeu.
 *
 * O preço da ordem escolhida é o oposto: se o provedor aceitar e a gravação falhar, a mensagem
 * saiu e não aparece aqui. Some do fio, mas o eco do provedor (AT-03) a traz de volta na
 * chegada — a mesma marca de idempotência que impede a duplicata cobre esse buraco.
 *
 * `sentByUserId` é o que a caixa compartilhada tem no lugar do dono da conversa: sem ele, não
 * há como saber quem falou com o cliente.
 */
export async function sendChannelMessage(
  deps: SendChannelMessageDeps,
  ctx: RequestContext,
  command: SendChannelMessageCommand,
): Promise<MessageRecord> {
  requireWriter(ctx);

  const body = command.body.trim();
  const anexo = command.media;
  // Sem anexo, o texto é a mensagem. Com anexo, ele é legenda e pode faltar.
  if (body === '' && anexo === undefined) throw new RequiredFieldError('mensagem');

  const conversa = await deps.conversations.findConversationById(
    ctx.tenantId,
    command.conversationId,
  );
  if (!conversa) throw new NotFoundError('conversa');

  const integration = await deps.integrations.findByChannel(ctx.tenantId, conversa.channel);
  if (!integration?.active) {
    throw new BusinessRuleError(
      'channel_not_connected',
      'O canal desta conversa não está conectado. Reconecte em Configurações → Integrações.',
    );
  }

  /*
   * AT-05 — quem o provedor disca é o **número**, não o LID.
   *
   * A conversa é identificada pelo LID quando ele existe, porque é o que não muda. Mas o LID
   * é o id da conta: mandar por ele é mensagem que não chega, e a recusa voltaria sem dizer
   * o motivo de verdade. Sem número, o certo é falar isso em vez de tentar.
   */
  const destino = conversa.phone;
  if (destino === null) {
    throw new BusinessRuleError(
      'no_phone',
      'Esta conversa ainda não tem o telefone do contato. Ela aparece quando ele mandar uma mensagem.',
    );
  }

  /*
   * AT-13 — manda primeiro, guarda depois, grava por último.
   *
   * Guardar o arquivo antes de mandar deixaria lixo no bucket toda vez que o provedor
   * recusasse; gravar antes de mandar deixaria no fio uma resposta que o cliente nunca
   * recebeu. A ordem escolhida erra só para o lado barato: arquivo enviado e não guardado
   * aparece no fio pelo marcador, e o eco do provedor (AT-03) traz o resto.
   */
  const enviado =
    anexo === undefined
      ? await deps.gateway.sendText({ integration, to: destino, text: body })
      : await deps.gateway.sendMedia({
          integration,
          to: destino,
          kind: anexo.kind,
          mimeType: anexo.mimeType,
          fileName: anexo.fileName,
          // Áudio de voz não tem legenda no WhatsApp: mandar uma inventaria um campo que o
          // aparelho não mostra.
          caption: anexo.kind === 'audio' || body === '' ? null : body,
          base64: anexo.base64,
        });
  if (!enviado.ok) {
    // O motivo do provedor sobe junto: sem ele a tela diz "não foi possível enviar" e não há
    // o que fazer com isso. É a diferença entre "número não existe" e "instância desconectada".
    throw new BusinessRuleError('send_failed', enviado.detail);
  }

  const sentAt = deps.clock();

  const guardado =
    anexo === undefined
      ? null
      : await deps.media.save({
          tenantId: ctx.tenantId,
          conversationId: conversa.id,
          externalId: enviado.externalId,
          mimeType: anexo.mimeType,
          fileName: anexo.fileName,
          base64: anexo.base64,
        });

  const mensagem = await deps.conversations.addMessage({
    tenantId: ctx.tenantId,
    conversationId: conversa.id,
    externalId: enviado.externalId,
    direction: 'out',
    body: body === '' && anexo !== undefined ? MARCADOR[anexo.kind] : body,
    sentByUserId: ctx.actor.userId,
    media:
      anexo === undefined || guardado === null
        ? null
        : {
            kind: anexo.kind,
            mimeType: anexo.mimeType,
            fileName: anexo.fileName,
            path: guardado.path,
            sizeBytes: guardado.sizeBytes,
          },
    // Sem corpo cru: esta mensagem nasceu aqui, não veio de webhook nenhum.
    payload: {},
    sentAt,
  });

  await deps.conversations.touchConversation(ctx.tenantId, conversa.id, {
    at: sentAt,
    direction: 'out',
  });

  return mensagem;
}

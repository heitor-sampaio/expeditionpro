import { requireTeam } from '../audience.js';
import { NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type {
  ConversationRepository,
  MessageMedia,
  MessageRecord,
} from './conversationRepository.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { MediaStore } from './mediaStore.js';
import { comCliente, type ConversationView } from './listConversations.js';

export interface ThreadDeps {
  readonly conversations: ConversationRepository;
  readonly customers: CustomerRepository;
  readonly media: MediaStore;
}

/**
 * AT-13 — a mensagem como a tela precisa dela: o anexo já com **URL assinada**.
 *
 * O caminho no bucket não sai daqui. O bucket é privado — o que está nele é conversa de
 * cliente —, e o que a tela recebe é um endereço que expira sozinho.
 */
export interface ThreadMessage extends Omit<MessageRecord, 'media'> {
  readonly media:
    | (Omit<MessageMedia, 'path'> & {
        /** Válida por poucos minutos: link vazado de um print morre sozinho. */
        readonly url: string;
      })
    | null;
}

export interface ConversationThread {
  readonly conversation: ConversationView;
  readonly messages: readonly ThreadMessage[];
}

/**
 * Curto de propósito. Tempo suficiente para abrir o fio, rolar e ver as fotos; curto o
 * bastante para um endereço copiado sem querer não virar acesso permanente.
 */
const MINUTOS_DA_URL = 10;

export interface GetConversationCommand {
  readonly conversationId: string;
}

/**
 * AT-07 — o fio inteiro, do primeiro "oi" à última resposta, em ordem cronológica.
 *
 * Sem paginação por enquanto: uma conversa de venda tem dezenas de mensagens, não milhares, e
 * paginar antes de doer é abstração especulativa. Quando doer, entra por data.
 */
export async function getConversation(
  deps: ThreadDeps,
  ctx: RequestContext,
  command: GetConversationCommand,
): Promise<ConversationThread> {
  requireTeam(ctx);

  const conversation = await deps.conversations.findConversationById(
    ctx.tenantId,
    command.conversationId,
  );
  // Conversa de outro tenant e conversa inexistente respondem igual — o repositório já é
  // escopado, e distinguir confirmaria que o id existe em algum lugar.
  if (!conversation) throw new NotFoundError('conversa');

  const messages = await deps.conversations.listMessages(ctx.tenantId, conversation.id);

  // Uma assinatura para o fio inteiro: dez fotos fariam dez chamadas ao Storage se fosse uma
  // por vez, e a tela esperaria por todas antes de mostrar qualquer coisa.
  const caminhos = messages.flatMap((m) => (m.media === null ? [] : [m.media.path]));
  const urls =
    caminhos.length === 0
      ? new Map<string, string>()
      : await deps.media.signedUrls(caminhos, MINUTOS_DA_URL * 60);

  const [comFicha] = await comCliente(deps, ctx.tenantId, [conversation]);
  return { conversation: comFicha!, messages: messages.map((m) => comUrl(m, urls)) };
}

function comUrl(message: MessageRecord, urls: ReadonlyMap<string, string>): ThreadMessage {
  if (message.media === null) return { ...message, media: null };
  const url = urls.get(message.media.path);
  // Sem assinatura, o anexo não aparece — mas a mensagem continua no fio, com o marcador.
  if (url === undefined) return { ...message, media: null };

  const { path: _guardado, ...visivel } = message.media;
  return { ...message, media: { ...visivel, url } };
}

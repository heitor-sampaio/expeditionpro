import type { ChannelIntegrationRecord } from './channelIntegrationRepository.js';

/**
 * AT-08 — a porta de saída para o provedor de mensagem.
 *
 * O mesmo desenho do gateway de pagamento, e pela mesma razão: a aplicação fala o vocabulário
 * daqui ("mandar um texto para este contato"), e o formato de cada provedor fica contido no
 * adaptador. É o que permite trocar a Evolution pela API oficial do WhatsApp sem tocar em
 * regra nenhuma — e a troca é assunto vivo, porque instância pareada por QR pode ser bloqueada.
 *
 * O envio **não lança** em falha do provedor: devolve o motivo. Quem chama decide o que fazer,
 * e neste sistema a decisão é não gravar a mensagem e mostrar o motivo na tela.
 */

export interface OutboundText {
  /** A conexão do canal, com o endereço da instância e a chave já em claro. */
  readonly integration: ChannelIntegrationRecord;
  /** Id da pessoa no canal: telefone no WhatsApp, id opaco na Meta. */
  readonly to: string;
  readonly text: string;
}

export type SendOutcome =
  /** `externalId` é o id da mensagem no provedor — a marca que o eco vai trazer (AT-03). */
  | { readonly ok: true; readonly externalId: string }
  /** Motivo em texto, para chegar à tela. Sem ele, "não foi possível enviar" e nada a fazer. */
  | { readonly ok: false; readonly detail: string };

/**
 * AT-13 — o anexo que sai. `caption` acompanha imagem, vídeo e documento; áudio de voz não
 * tem legenda no WhatsApp, e mandar uma seria inventar um campo que o aparelho não mostra.
 */
export interface OutboundMedia {
  readonly integration: ChannelIntegrationRecord;
  readonly to: string;
  readonly kind: 'image' | 'video' | 'audio' | 'document';
  readonly mimeType: string;
  readonly fileName: string | null;
  readonly caption: string | null;
  readonly base64: string;
}

export interface MessagingGateway {
  sendText(message: OutboundText): Promise<SendOutcome>;
  sendMedia(message: OutboundMedia): Promise<SendOutcome>;
}

/**
 * AT-03 · AT-05 — o corpo cru do webhook da Evolution vira mensagem, ou é ignorado.
 *
 * Puro: entra o payload, sai o que interessa. Mesmo desenho do `mapAsaasEvent` e pela mesma
 * razão — o provedor manda muito evento que não é nosso assunto (status de entrega, presença,
 * conexão), e reconhecer isso é regra de negócio, não infraestrutura.
 *
 * **Ignorar não é erro.** Evento desconhecido responde 200 e some: devolver erro faria a
 * Evolution reenviar em laço para sempre.
 */

export type EvolutionEvent =
  | { readonly kind: 'ignored' }
  | {
      readonly kind: 'message';
      /** Id da mensagem no provedor: é a chave de idempotência (AT-03). */
      readonly externalId: string;
      /** Só os dígitos do JID — `5548999998877@s.whatsapp.net` vira `5548999998877`. */
      readonly channelUserId: string;
      readonly direction: 'in' | 'out';
      readonly body: string;
      readonly displayName: string | null;
      readonly sentAt: Date;
    };

const IGNORED: EvolutionEvent = { kind: 'ignored' };

/**
 * Mídia sem legenda ainda é mensagem: some com ela e a conversa perde o fio. Até a fase de
 * mídia (AT-13), a caixa mostra que veio uma foto em vez de uma linha vazia.
 */
const AVISO_DE_MIDIA: Record<string, string> = {
  imageMessage: '[imagem]',
  videoMessage: '[vídeo]',
  audioMessage: '[áudio]',
  documentMessage: '[documento]',
  stickerMessage: '[figurinha]',
  locationMessage: '[localização]',
  contactMessage: '[contato]',
};

export function mapEvolutionEvent(body: unknown): EvolutionEvent {
  const envelope = body as { event?: unknown; data?: unknown } | null | undefined;
  if (!envelope || typeof envelope !== 'object') return IGNORED;
  if (envelope.event !== 'messages.upsert') return IGNORED;

  const data = envelope.data as
    | {
        key?: { remoteJid?: unknown; fromMe?: unknown; id?: unknown };
        pushName?: unknown;
        message?: Record<string, unknown>;
        messageTimestamp?: unknown;
      }
    | null
    | undefined;
  if (!data || typeof data !== 'object') return IGNORED;

  const externalId = typeof data.key?.id === 'string' ? data.key.id : null;
  const remoteJid = typeof data.key?.remoteJid === 'string' ? data.key.remoteJid : null;
  if (!externalId || !remoteJid) return IGNORED;

  // `@g.us` é grupo. Atendimento é conversa de um para um; grupo tem muitos autores e
  // nenhum dono, e tratá-lo como conversa criaria um fio que ninguém consegue responder.
  if (!remoteJid.endsWith('@s.whatsapp.net')) return IGNORED;

  const channelUserId = remoteJid.split('@')[0] ?? '';
  if (channelUserId === '') return IGNORED;

  const texto = textoDe(data.message);
  if (texto === null) return IGNORED;

  return {
    kind: 'message',
    externalId,
    channelUserId,
    // O celular pareado continua sendo usado à mão: sem `fromMe`, a caixa contaria só
    // metade da conversa, que é pior que não ter caixa.
    direction: data.key?.fromMe === true ? 'out' : 'in',
    body: texto,
    displayName: typeof data.pushName === 'string' && data.pushName !== '' ? data.pushName : null,
    sentAt: horarioDe(data.messageTimestamp),
  };
}

function textoDe(message: Record<string, unknown> | undefined): string | null {
  if (!message || typeof message !== 'object') return null;

  if (typeof message['conversation'] === 'string') return message['conversation'];

  // Formato que o WhatsApp usa quando a mensagem cita outra ou traz link.
  const estendida = message['extendedTextMessage'] as { text?: unknown } | undefined;
  if (estendida && typeof estendida.text === 'string') return estendida.text;

  for (const [chave, aviso] of Object.entries(AVISO_DE_MIDIA)) {
    if (chave in message) {
      const legenda = (message[chave] as { caption?: unknown }).caption;
      return typeof legenda === 'string' && legenda !== '' ? legenda : aviso;
    }
  }

  return null;
}

/** O timestamp vem em segundos; `Date` quer milissegundos. */
function horarioDe(timestamp: unknown): Date {
  const segundos = typeof timestamp === 'number' ? timestamp : Number(timestamp);
  return Number.isFinite(segundos) ? new Date(segundos * 1000) : new Date(0);
}

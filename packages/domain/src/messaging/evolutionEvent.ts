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
      /**
       * A identidade do contato no canal: o **LID** quando existe, senão o telefone. Só os
       * dígitos — `5548999998877@s.whatsapp.net` vira `5548999998877`.
       */
      readonly channelUserId: string;
      /**
       * O telefone, quando o evento traz um. É o que disca, o que casa com a ficha do cliente
       * (AT-06) e o único dos dois que alguém reconhece na tela. `null` quando só há LID.
       */
      readonly phone: string | null;
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
        key?: {
          remoteJid?: unknown;
          /** O outro endereçamento do mesmo contato: LID quando `remoteJid` é telefone, e vice-versa. */
          remoteJidAlt?: unknown;
          fromMe?: unknown;
          id?: unknown;
        };
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

  const identidade = identidadeDe(remoteJid, data.key?.remoteJidAlt);
  if (identidade === null) return IGNORED;

  const texto = textoDe(data.message);
  if (texto === null) return IGNORED;

  // O celular pareado continua sendo usado à mão: sem `fromMe`, a caixa contaria só metade
  // da conversa, que é pior que não ter caixa.
  const saindo = data.key?.fromMe === true;

  return {
    kind: 'message',
    externalId,
    channelUserId: identidade.channelUserId,
    phone: identidade.phone,
    direction: saindo ? 'out' : 'in',
    body: texto,
    /*
     * `pushName` é o nome de perfil de **quem mandou** — e em mensagem que sai, quem mandou
     * somos nós. Aproveitá-lo ali renomeia o contato com o nome da própria empresa, que foi
     * o que aconteceu em produção: bastava alguém responder para a conversa virar
     * "Drakkar Expedições".
     */
    displayName:
      !saindo && typeof data.pushName === 'string' && data.pushName !== '' ? data.pushName : null,
    sentAt: horarioDe(data.messageTimestamp),
  };
}

/**
 * AT-05 — quem é o contato, no meio da migração do WhatsApp para o LID.
 *
 * O evento traz os dois endereçamentos do mesmo contato, e **qual vai em qual campo varia**:
 * ora o LID está em `remoteJid` e o telefone em `remoteJidAlt`, ora o contrário. Por isso a
 * escolha é pelo sufixo do JID, não pela posição.
 *
 * O LID é a identidade quando existe porque é o que não muda — telefone o cliente troca. O
 * telefone é guardado do lado porque é o que disca e o que casa com a ficha (AT-06).
 *
 * `@g.us` é grupo, e grupo fica fora: tem muitos autores e nenhum dono, e viraria um fio que
 * ninguém consegue responder. Qualquer outro sufixo (transmissão, status) também sai.
 */
function identidadeDe(
  remoteJid: string,
  alt: unknown,
): { channelUserId: string; phone: string | null } | null {
  const jids = [remoteJid, typeof alt === 'string' ? alt : null].filter(
    (jid): jid is string => jid !== null,
  );
  if (jids.some((jid) => jid.endsWith('@g.us'))) return null;

  const digitos = (sufixo: string): string | null => {
    const achado = jids.find((jid) => jid.endsWith(sufixo));
    const parte = achado?.slice(0, achado.length - sufixo.length) ?? '';
    return parte === '' ? null : parte;
  };

  const lid = digitos('@lid');
  const phone = digitos('@s.whatsapp.net');
  const channelUserId = lid ?? phone;
  return channelUserId === null ? null : { channelUserId, phone };
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

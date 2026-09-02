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
      /** AT-13: o arquivo que veio junto, quando veio. `null` em mensagem de texto. */
      readonly media: EvolutionMedia | null;
      readonly sentAt: Date;
    };

/**
 * AT-13 — o arquivo que o lead mandou.
 *
 * A instalação daqui entrega o conteúdo **dentro do webhook**, em `message.base64` — foi
 * verificado no corpo cru de uma imagem real. Por isso não há segunda chamada ao provedor
 * para buscar mídia: o que precisa ser guardado já chegou.
 */
export interface EvolutionMedia {
  readonly kind: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  readonly mimeType: string;
  /** Só documento costuma trazer nome; foto e áudio chegam sem. */
  readonly fileName: string | null;
  readonly base64: string;
}

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

/**
 * Quais desses tipos são **arquivo**. Localização e contato entram na conversa como marcador
 * e nada mais: não há o que baixar, e inventar um anexo para eles seria mentira.
 */
const ESPECIE: Record<string, EvolutionMedia['kind']> = {
  imageMessage: 'image',
  videoMessage: 'video',
  audioMessage: 'audio',
  documentMessage: 'document',
  stickerMessage: 'sticker',
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
    media: midiaDe(data.message),
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

/**
 * AT-13 — o arquivo, quando o evento traz um.
 *
 * Sem `base64` devolve `null` e a mensagem **continua entrando**, com o marcador de sempre:
 * sumir com ela deixaria um buraco no fio, e quem lê não saberia que algo foi mandado.
 *
 * Tipo ausente vira `application/octet-stream` em vez de recusa. O arquivo já está aqui;
 * guardá-lo sem saber o formato é melhor que perdê-lo por causa de um campo que faltou.
 */
function midiaDe(message: Record<string, unknown> | undefined): EvolutionMedia | null {
  if (!message || typeof message !== 'object') return null;

  const base64 = message['base64'];
  if (typeof base64 !== 'string' || base64 === '') return null;

  for (const [chave, kind] of Object.entries(ESPECIE)) {
    if (!(chave in message)) continue;
    const conteudo = (message[chave] ?? {}) as { mimetype?: unknown; fileName?: unknown };
    return {
      kind,
      mimeType:
        typeof conteudo.mimetype === 'string' && conteudo.mimetype !== ''
          ? conteudo.mimetype
          : 'application/octet-stream',
      fileName:
        typeof conteudo.fileName === 'string' && conteudo.fileName !== ''
          ? conteudo.fileName
          : null,
      base64,
    };
  }
  return null;
}

/** O timestamp vem em segundos; `Date` quer milissegundos. */
function horarioDe(timestamp: unknown): Date {
  const segundos = typeof timestamp === 'number' ? timestamp : Number(timestamp);
  return Number.isFinite(segundos) ? new Date(segundos * 1000) : new Date(0);
}

/**
 * AT-04 · AT-13 — o corpo cru **sem** o arquivo.
 *
 * O payload do webhook é guardado como registro do que chegou. Com o arquivo dentro, uma foto
 * de 500 KB vira 687 KB de base64 numa coluna JSONB, por mensagem — e o mesmo conteúdo já
 * está no bucket. Em um mês de operação isso é o maior objeto do banco, guardado duas vezes.
 *
 * Tira só o `base64`. Todo o resto continua: é o que permite conferir depois o que a
 * Evolution mandou, que é a razão de o registro existir.
 */
export function stripMediaBytes(body: unknown): unknown {
  const envelope = body as { data?: { message?: Record<string, unknown> } } | null | undefined;
  const message = envelope?.data?.message;
  if (!message || typeof message !== 'object' || !('base64' in message)) return body;

  const { base64: _descartado, ...semArquivo } = message;
  return {
    ...(envelope as object),
    data: { ...(envelope!.data as object), message: semArquivo },
  };
}

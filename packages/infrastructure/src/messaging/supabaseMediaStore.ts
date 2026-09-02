import { OUTBOUND_TIMEOUT_MS } from '../outbound.js';
import type { MediaStore, NewMedia, StoredMedia } from '@expedition/application';

/**
 * AT-13 — o bucket privado das conversas, pela API REST do Storage.
 *
 * Mesmo desenho do `supabaseAuthAdmin`: `fetch` cru com a chave de serviço, sem SDK.
 *
 * **Nada aqui lança.** Guardar um anexo não pode derrubar a mensagem — falha vira `null`, e
 * quem chama grava a mensagem com o marcador. Um anexo perdido é um problema; uma mensagem
 * que some do fio é outro bem maior.
 *
 * O bucket não tem policy de leitura: todo acesso passa pelo servidor, que assina uma URL
 * curta depois de conferir a audiência (AT-11). Isso vale por desenho, não por descuido.
 */

const BUCKET = 'conversations';

/**
 * Teto do que sobe. O WhatsApp já limita o que passa por ele; isto existe para uma instalação
 * com limite diferente não virar um objeto de centenas de megabytes no bucket, cobrado por mês.
 */
const TETO_BYTES = 64 * 1024 * 1024;

/**
 * A extensão sai do **tipo declarado**, nunca do nome que o remetente escolheu: nome de
 * arquivo é texto de terceiro, e já foi caminho de travessia de diretório em sistema demais.
 */
const EXTENSAO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'video/quicktime': 'mov',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
};

export interface SupabaseMediaStoreConfig {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export function supabaseMediaStore(config: SupabaseMediaStoreConfig): MediaStore {
  const base = `${config.url.replace(/\/+$/, '')}/storage/v1`;
  const call = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? OUTBOUND_TIMEOUT_MS;
  const auth = {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
  };

  return {
    async save(media: NewMedia): Promise<StoredMedia | null> {
      const bytes = Buffer.from(media.base64, 'base64');
      if (bytes.length === 0 || bytes.length > TETO_BYTES) return null;

      const extensao = EXTENSAO[media.mimeType.toLowerCase()];
      const path = `${media.tenantId}/${media.conversationId}/${media.externalId}${
        extensao === undefined ? '' : `.${extensao}`
      }`;

      try {
        const response = await call(`${base}/object/${BUCKET}/${path}`, {
          method: 'POST',
          headers: { ...auth, 'content-type': media.mimeType },
          body: new Uint8Array(bytes),
          // SEC: sem sinal, `fetch` espera para sempre. Ver `OUTBOUND_TIMEOUT_MS`.
          signal: AbortSignal.timeout(timeoutMs),
        });
        return response.ok ? { path, sizeBytes: bytes.length } : null;
      } catch {
        // Storage fora do ar, prazo estourado: a mensagem entra sem o anexo. O motivo não
        // sobe porque não há o que a equipe faça com ele — e o corpo cru guardado (AT-04)
        // preserva o que chegou, então o arquivo pode ser recuperado depois se precisar.
        return null;
      }
    },

    async signedUrls(paths: readonly string[], ttlSeconds: number) {
      if (paths.length === 0) return new Map<string, string>();

      try {
        const response = await call(`${base}/object/sign/${BUCKET}`, {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ expiresIn: ttlSeconds, paths: [...paths] }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return new Map<string, string>();

        const corpo = (await response.json().catch(() => null)) as
          { path?: unknown; signedURL?: unknown }[] | null;
        if (!Array.isArray(corpo)) return new Map<string, string>();

        return new Map(
          corpo.flatMap((item) =>
            typeof item.path === 'string' && typeof item.signedURL === 'string'
              ? [[item.path, `${base}${item.signedURL}`] as const]
              : [],
          ),
        );
      } catch {
        // Sem assinatura o fio aparece sem as imagens, e é melhor que a tela não abrir.
        return new Map<string, string>();
      }
    },
  };
}

import type { MediaStore, NewMedia, StoredMedia } from './mediaStore.js';

/** Fake do armazenamento de mídia (§5.17). Fora do build. */
export function fakeMediaStore(): MediaStore & {
  arquivos: (NewMedia & { path: string })[];
  falhar(): void;
} {
  const arquivos: (NewMedia & { path: string })[] = [];
  let falha = false;

  return {
    arquivos,

    falhar() {
      falha = true;
    },

    save(media: NewMedia): Promise<StoredMedia | null> {
      if (falha) return Promise.resolve(null);
      const path = `${media.tenantId}/${media.conversationId}/${media.externalId}`;
      arquivos.push({ ...media, path });
      // Base64 cresce ~4/3 sobre o binário; o fake devolve algo coerente com isso.
      return Promise.resolve({ path, sizeBytes: Math.floor((media.base64.length * 3) / 4) });
    },

    signedUrls(paths: readonly string[]) {
      return Promise.resolve(new Map(paths.map((path) => [path, `https://assinada/${path}`])));
    },
  };
}

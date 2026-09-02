import type { Anexo } from './useInbox.js';

/**
 * AT-13 — as decisões pequenas que antecedem o envio de um anexo.
 *
 * Puras, e separadas do componente porque é onde estão os erros que aparecem tarde: espécie
 * errada faz o WhatsApp mostrar uma foto como documento; prefixo `data:` esquecido vira recusa
 * sem explicação; e arquivo grande demais só falha depois de um minuto subindo.
 */

/**
 * O maior arquivo que a tela deixa subir. O WhatsApp aceita menos que isto na maioria dos
 * tipos, e o servidor tem o próprio teto — este existe para o erro aparecer **antes** da
 * espera, e não depois dela.
 */
export const LIMITE_BYTES = 16 * 1024 * 1024;

/**
 * A espécie sai do tipo do arquivo. Tudo que não é mídia tocável vira documento, inclusive o
 * desconhecido: documento é o único que o WhatsApp mostra com nome de arquivo, e é o que salva
 * um formato que ele não entende.
 */
export function kindOf(mimeType: string): Anexo['kind'] {
  const grupo = mimeType.split('/')[0]?.toLowerCase();
  if (grupo === 'image') return 'image';
  if (grupo === 'video') return 'video';
  if (grupo === 'audio') return 'audio';
  return 'document';
}

/**
 * `FileReader` e a gravação devolvem `data:image/jpeg;base64,AAAA`. O provedor quer só o
 * conteúdo — com o prefixo, a recusa vem sem motivo legível.
 */
export function semPrefixo(dataUrl: string): string {
  const virgula = dataUrl.indexOf(',');
  return dataUrl.startsWith('data:') && virgula !== -1 ? dataUrl.slice(virgula + 1) : dataUrl;
}

export function tamanhoAceito(bytes: number): boolean {
  return bytes > 0 && bytes <= LIMITE_BYTES;
}

/** Lê o arquivo escolhido no formato em que ele sobe. */
export function lerArquivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      resolve(semPrefixo(String(leitor.result)));
    };
    leitor.onerror = () => {
      reject(new Error('não foi possível ler o arquivo'));
    };
    leitor.readAsDataURL(file);
  });
}

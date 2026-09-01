/**
 * Logo da empresa (CF-01/CF-03) — guardada como data URI junto da configuração do
 * tenant, não como arquivo em bucket.
 *
 * O formato importa porque o consumidor difícil não é a tela: é o gerador da roomlist,
 * que roda no servidor e só embute **PNG e JPEG**. O upload de fotos do sistema converte
 * tudo para WebP, que não serve aqui — por isso a logo tem caminho próprio.
 */

export class InvalidCompanyLogoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCompanyLogoError';
  }
}

export type LogoFormat = 'png' | 'jpeg';

/**
 * Teto do que cabe numa configuração lida a cada geração de documento e a cada carga
 * da navegação. Uma logo redimensionada não chega perto disso; uma foto de câmera, sim.
 */
export const LOGO_MAX_BYTES = 512 * 1024;

const DATA_URI = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+=*)$/;

/** Valida e devolve a logo como veio; qualquer desvio é erro de tipo, não silêncio. */
export function parseCompanyLogo(raw: string): string {
  const match = DATA_URI.exec(raw.trim());
  if (!match) {
    throw new InvalidCompanyLogoError('A logo precisa ser uma imagem PNG ou JPG');
  }
  if (raw.length > LOGO_MAX_BYTES) {
    throw new InvalidCompanyLogoError('A logo passou do tamanho máximo');
  }
  return raw.trim();
}

/** O formato do data URI já validado — é o que decide como o PDF embute a imagem. */
export function logoImageFormat(logo: string): LogoFormat {
  return logo.startsWith('data:image/png') ? 'png' : 'jpeg';
}

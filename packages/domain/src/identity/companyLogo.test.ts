import { describe, expect, it } from 'vitest';
import {
  InvalidCompanyLogoError,
  LOGO_MAX_BYTES,
  parseCompanyLogo,
  logoImageFormat,
} from './companyLogo.js';

/**
 * CF-01/CF-03 — a logo da empresa entra como data URI e é guardada com a configuração
 * do tenant. Como ela vai parar num PDF gerado no servidor, o formato não é detalhe:
 * PNG e JPEG são os que o gerador embute. WebP e SVG, não.
 */

// 1×1 PNG transparente, o menor arquivo válido que existe.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJ';

describe('CF-01: a logo aceita o que o documento consegue imprimir', () => {
  it('aceita PNG e JPEG', () => {
    expect(parseCompanyLogo(PNG)).toBe(PNG);
    expect(parseCompanyLogo(JPEG)).toBe(JPEG);
  });

  it('diz qual é o formato, para o gerador escolher como embutir', () => {
    expect(logoImageFormat(PNG)).toBe('png');
    expect(logoImageFormat(JPEG)).toBe('jpeg');
  });

  it('recusa WebP e SVG — o gerador de PDF não os embute', () => {
    // O upload de fotos do sistema converte tudo para WebP; a logo tem caminho próprio
    // justamente por isso. SVG, além de não embutir, é um vetor de script.
    expect(() => parseCompanyLogo('data:image/webp;base64,UklGRh4AAABXRUJQ')).toThrow(
      InvalidCompanyLogoError,
    );
    expect(() => parseCompanyLogo('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toThrow(
      InvalidCompanyLogoError,
    );
  });

  it('recusa o que não é data URI de imagem', () => {
    expect(() => parseCompanyLogo('https://exemplo.com/logo.png')).toThrow(InvalidCompanyLogoError);
    expect(() => parseCompanyLogo('data:text/html;base64,PHNjcmlwdD4=')).toThrow(
      InvalidCompanyLogoError,
    );
    expect(() => parseCompanyLogo('')).toThrow(InvalidCompanyLogoError);
  });

  it('recusa base64 corrompido', () => {
    expect(() => parseCompanyLogo('data:image/png;base64,não-é-base64!!')).toThrow(
      InvalidCompanyLogoError,
    );
  });

  it('recusa imagem grande demais para viver na configuração', () => {
    const enorme = `data:image/png;base64,${'A'.repeat(LOGO_MAX_BYTES * 2)}`;

    expect(() => parseCompanyLogo(enorme)).toThrow(InvalidCompanyLogoError);
  });
});

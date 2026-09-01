/**
 * Regras puras do conteúdo da comunidade (§5.12 · CO-01/CO-04). Post é **foto com
 * legenda**: de 1 a 3 fotos (ao menos uma — post sem foto não é aceito), legenda de até
 * 2.000 caracteres; comentário de até 1.000. Sem I/O — validação de borda antes de gravar.
 */

export const MAX_MEDIA = 3;
export const MAX_CAPTION = 2000;
export const MAX_COMMENT = 1000;

export type PostValidationCode =
  'no_media' | 'too_many_media' | 'caption_too_long' | 'comment_empty' | 'comment_too_long';

export class PostValidationError extends Error {
  readonly code: PostValidationCode;
  constructor(code: PostValidationCode) {
    super(`conteúdo inválido: ${code}`);
    this.name = 'PostValidationError';
    this.code = code;
  }
}

export function validatePostContent(input: { mediaCount: number; caption: string }): void {
  if (input.mediaCount < 1) throw new PostValidationError('no_media');
  if (input.mediaCount > MAX_MEDIA) throw new PostValidationError('too_many_media');
  if (input.caption.length > MAX_CAPTION) throw new PostValidationError('caption_too_long');
}

export function validateComment(body: string): void {
  if (body.trim().length === 0) throw new PostValidationError('comment_empty');
  if (body.length > MAX_COMMENT) throw new PostValidationError('comment_too_long');
}

/**
 * Hashtags da legenda (CO-01): `#tag` → `tag`. Únicas, em minúsculas, na ordem de aparição.
 * Aceita letra (com acento), número e `_`; ignora um `#` solto. Pura — o mesmo texto sempre
 * dá o mesmo resultado, sem depender de locale.
 */
/** Como as fotos de um post com mais de uma imagem são exibidas (CO-01). */
export const POST_LAYOUTS = ['carousel', 'mosaic'] as const;
export type PostLayout = (typeof POST_LAYOUTS)[number];

/** Normaliza o layout vindo da borda: só `carousel` ou `mosaic`; o resto vira `mosaic`. */
export function normalizePostLayout(value: string): PostLayout {
  return value === 'carousel' ? 'carousel' : 'mosaic';
}

export function extractHashtags(caption: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const match of caption.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    const tag = match[1]!.toLowerCase();
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

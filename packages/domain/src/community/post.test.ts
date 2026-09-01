import { describe, expect, it } from 'vitest';
import {
  validatePostContent,
  validateComment,
  extractHashtags,
  normalizePostLayout,
  PostValidationError,
} from './post.js';

/**
 * §5.12 · CO-01/CO-04 — regras puras do conteúdo da comunidade. Post é foto com legenda:
 * 1 a 3 fotos (obrigatória ao menos uma), legenda até 2.000; comentário até 1.000.
 */

describe('CO-01: conteúdo do post', () => {
  it('aceita 1 a 3 fotos com legenda dentro do limite', () => {
    expect(() => validatePostContent({ mediaCount: 1, caption: 'oi' })).not.toThrow();
    expect(() => validatePostContent({ mediaCount: 3, caption: '' })).not.toThrow();
  });

  it('recusa post sem foto', () => {
    expect(() => validatePostContent({ mediaCount: 0, caption: 'sem foto' })).toThrow(
      PostValidationError,
    );
  });

  it('recusa mais de 3 fotos', () => {
    try {
      validatePostContent({ mediaCount: 4, caption: '' });
      throw new Error('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(PostValidationError);
      expect((e as PostValidationError).code).toBe('too_many_media');
    }
  });

  it('recusa legenda acima de 2000 caracteres', () => {
    try {
      validatePostContent({ mediaCount: 1, caption: 'x'.repeat(2001) });
      throw new Error('deveria ter lançado');
    } catch (e) {
      expect((e as PostValidationError).code).toBe('caption_too_long');
    }
  });
});

describe('CO-01: hashtags da legenda', () => {
  it('extrai tags únicas, sem o #, em minúsculas, na ordem de aparição', () => {
    expect(extractHashtags('Que #Trilha! Bora de #4x4 na #trilha')).toEqual(['trilha', '4x4']);
  });

  it('aceita letra acentuada e _ , ignora # solto', () => {
    expect(extractHashtags('#coxilha_rica subindo a # com #Montanha')).toEqual([
      'coxilha_rica',
      'montanha',
    ]);
  });

  it('sem hashtags → lista vazia', () => {
    expect(extractHashtags('só texto sem tag')).toEqual([]);
  });
});

describe('CO-01: layout de mídia do post', () => {
  it('aceita carousel e mosaic; qualquer outro valor cai em mosaic (default seguro)', () => {
    expect(normalizePostLayout('carousel')).toBe('carousel');
    expect(normalizePostLayout('mosaic')).toBe('mosaic');
    expect(normalizePostLayout('xpto')).toBe('mosaic');
    expect(normalizePostLayout('')).toBe('mosaic');
  });
});

describe('CO-04: comentário', () => {
  it('aceita até 1000 caracteres', () => {
    expect(() => validateComment('x'.repeat(1000))).not.toThrow();
  });

  it('recusa vazio e acima de 1000', () => {
    expect(() => validateComment('   ')).toThrow(PostValidationError);
    expect(() => validateComment('x'.repeat(1001))).toThrow(PostValidationError);
  });
});

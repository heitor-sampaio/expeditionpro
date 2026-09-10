import { describe, expect, it } from 'vitest';
import { inserirMarcador } from './marcador.js';

/**
 * AU-27 — a variável entra onde o cursor está.
 *
 * Ela entrava sempre no **fim** do texto. Numa coluna estreita ninguém notava; num painel em
 * que se escreve a mensagem inteira do WhatsApp, escrever "Oi , tudo bem?", pôr o cursor
 * depois do "Oi " e receber o nome grudado no fim da frase é a diferença entre a ferramenta
 * servir e não servir.
 */
describe('AU-27: inserir a variável na posição do cursor', () => {
  it('entra no meio da frase, onde o cursor estava', () => {
    expect(inserirMarcador('Oi , tudo bem?', 3, 3, 'contato.nome')).toEqual({
      texto: 'Oi {{contato.nome}}, tudo bem?',
      cursor: 3 + '{{contato.nome}}'.length,
    });
  });

  it('campo vazio recebe o marcador e mais nada', () => {
    expect(inserirMarcador('', 0, 0, 'contato.nome')).toEqual({
      texto: '{{contato.nome}}',
      cursor: '{{contato.nome}}'.length,
    });
  });

  /** Com texto selecionado, o gesto é trocar — é o que qualquer editor faz. */
  it('a seleção é substituída pelo marcador', () => {
    expect(inserirMarcador('Oi FULANO, tudo bem?', 3, 9, 'contato.nome')).toEqual({
      texto: 'Oi {{contato.nome}}, tudo bem?',
      cursor: 3 + '{{contato.nome}}'.length,
    });
  });

  it('no fim do texto continua indo para o fim', () => {
    expect(inserirMarcador('Oi ', 3, 3, 'contato.nome').texto).toBe('Oi {{contato.nome}}');
  });

  /**
   * Sem cursor conhecido — o campo nunca recebeu foco de verdade — o fim é o destino honesto:
   * é onde a pessoa estava escrevendo.
   */
  it('sem posição, vai para o fim', () => {
    expect(inserirMarcador('Oi', null, null, 'contato.nome').texto).toBe('Oi{{contato.nome}}');
  });

  /** Posição além do texto não pode cortar nada: um cursor velho não apaga o que foi digitado. */
  it('posição fora do texto não perde caractere', () => {
    expect(inserirMarcador('Oi', 99, 99, 'x').texto).toBe('Oi{{x}}');
  });
});

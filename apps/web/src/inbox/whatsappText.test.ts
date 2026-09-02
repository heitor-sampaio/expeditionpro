import { describe, expect, it } from 'vitest';
import { parseWhatsAppText } from './whatsappText.js';

/**
 * AT-07 — o texto do WhatsApp tem formatação própria, e ela chega crua.
 *
 * Sem interpretar, a equipe lê `*combinado*` com os asteriscos na cara e uma lista vira um
 * monte de traços. Pior: quem escreveu do outro lado **viu formatado** no aparelho, e a caixa
 * mostra outra coisa — a mesma mensagem com duas aparências.
 *
 * São seis marcações: negrito, itálico, tachado, monoespaçado, citação e lista. Todas entram,
 * porque meia interpretação é pior que nenhuma: o que ficar de fora aparece com o símbolo
 * solto no meio do texto já formatado.
 *
 * O resultado é uma árvore, não HTML. O React monta os elementos a partir dela, e texto de
 * terceiro nunca vira marcação executável — a conversa é o lugar mais óbvio para alguém tentar.
 */

const texto = (t: string) => ({ kind: 'text', text: t });

describe('AT-07: marcações de linha', () => {
  it('negrito entre asteriscos', () => {
    expect(parseWhatsAppText('o valor é *fechado*')).toEqual([
      {
        kind: 'paragraph',
        children: [texto('o valor é '), { kind: 'bold', children: [texto('fechado')] }],
      },
    ]);
  });

  it('itálico, tachado e monoespaçado inline', () => {
    expect(parseWhatsAppText('_talvez_ ~não~ `codigo`')).toEqual([
      {
        kind: 'paragraph',
        children: [
          { kind: 'italic', children: [texto('talvez')] },
          texto(' '),
          { kind: 'strike', children: [texto('não')] },
          texto(' '),
          { kind: 'code', children: [texto('codigo')] },
        ],
      },
    ]);
  });

  it('marcações se aninham', () => {
    expect(parseWhatsAppText('*_os dois_*')).toEqual([
      {
        kind: 'paragraph',
        children: [{ kind: 'bold', children: [{ kind: 'italic', children: [texto('os dois')] }] }],
      },
    ]);
  });

  /**
   * O asterisco solto de quem está fazendo conta — "2 * 3" — não pode virar negrito comendo
   * meia mensagem. A regra do WhatsApp é a mesma: a marcação abre colada no texto.
   */
  it('marcador com espaço depois não abre formatação', () => {
    expect(parseWhatsAppText('2 * 3 * 4')).toEqual([
      { kind: 'paragraph', children: [texto('2 * 3 * 4')] },
    ]);
  });

  it('marcador sem par aparece como o caractere que é', () => {
    expect(parseWhatsAppText('promoção*')).toEqual([
      { kind: 'paragraph', children: [texto('promoção*')] },
    ]);
  });

  it('dentro do monoespaçado, marcador é texto — é o ponto de existir', () => {
    expect(parseWhatsAppText('`a*b*c`')).toEqual([
      { kind: 'paragraph', children: [{ kind: 'code', children: [texto('a*b*c')] }] },
    ]);
  });
});

describe('AT-07: blocos', () => {
  it('citação começa com maior-que', () => {
    expect(parseWhatsAppText('> como combinamos')).toEqual([
      { kind: 'quote', children: [texto('como combinamos')] },
    ]);
  });

  it('lista com traço', () => {
    expect(parseWhatsAppText('- primeiro\n- segundo')).toEqual([
      { kind: 'bullet', items: [[texto('primeiro')], [texto('segundo')]] },
    ]);
  });

  /** `* ` com espaço é lista; `*x*` colado é negrito. É o espaço que separa os dois. */
  it('lista com asterisco não vira negrito', () => {
    expect(parseWhatsAppText('* café\n* gasolina')).toEqual([
      { kind: 'bullet', items: [[texto('café')], [texto('gasolina')]] },
    ]);
  });

  it('lista numerada guarda por onde começa', () => {
    expect(parseWhatsAppText('3. terceiro\n4. quarto')).toEqual([
      { kind: 'ordered', start: 3, items: [[texto('terceiro')], [texto('quarto')]] },
    ]);
  });

  it('bloco monoespaçado com três crases atravessa linhas', () => {
    expect(parseWhatsAppText('```\nchave: valor\noutra: coisa\n```')).toEqual([
      { kind: 'pre', text: 'chave: valor\noutra: coisa' },
    ]);
  });

  it('formatação vale dentro do item da lista', () => {
    expect(parseWhatsAppText('- *pago*')).toEqual([
      { kind: 'bullet', items: [[{ kind: 'bold', children: [texto('pago')] }]] },
    ]);
  });

  it('linhas soltas viram parágrafos, preservando a quebra', () => {
    expect(parseWhatsAppText('bom dia\ntudo bem?')).toEqual([
      { kind: 'paragraph', children: [texto('bom dia')] },
      { kind: 'paragraph', children: [texto('tudo bem?')] },
    ]);
  });

  it('texto vazio não vira bloco nenhum', () => {
    expect(parseWhatsAppText('')).toEqual([]);
  });
});

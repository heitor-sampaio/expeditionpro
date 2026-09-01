import { describe, it, expect } from 'vitest';
import { parseBlocks, parseInline } from './richTextParser.js';

/**
 * O texto do usuário precisa aparecer como ele digitou: linha em branco separa parágrafo,
 * Enter simples quebra a linha dentro do mesmo parágrafo.
 *
 * O `#` é ambíguo entre os dois usos do editor, então o modo decide: na **comunidade** ele
 * é sempre hashtag; na **descrição do roteiro** não existe hashtag de conteúdo, então vale
 * como título de markdown.
 */
describe('richtext: quebras de linha e linhas em branco', () => {
  it('linha em branco separa parágrafos', () => {
    const blocks = parseBlocks('primeiro\n\nsegundo', 'hashtags');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: 'p', lines: ['primeiro'] });
    expect(blocks[1]).toEqual({ type: 'p', lines: ['segundo'] });
  });

  it('Enter simples quebra a linha dentro do mesmo parágrafo', () => {
    const blocks = parseBlocks('linha um\nlinha dois', 'hashtags');
    expect(blocks).toEqual([{ type: 'p', lines: ['linha um', 'linha dois'] }]);
  });

  it('várias linhas em branco seguidas não viram parágrafos vazios', () => {
    const blocks = parseBlocks('a\n\n\n\nb', 'hashtags');
    expect(blocks).toEqual([
      { type: 'p', lines: ['a'] },
      { type: 'p', lines: ['b'] },
    ]);
  });

  it('lista com "- " continua agrupando os itens', () => {
    const blocks = parseBlocks('- um\n- dois\n\ntexto', 'hashtags');
    expect(blocks[0]).toEqual({ type: 'ul', items: ['um', 'dois'] });
    expect(blocks[1]).toEqual({ type: 'p', lines: ['texto'] });
  });
});

describe('richtext: # como título (descrição do roteiro)', () => {
  it('# ## ### viram títulos de nível 1, 2 e 3', () => {
    const blocks = parseBlocks('# Grande\n## Média\n### Pequena', 'headings');
    expect(blocks).toEqual([
      { type: 'h', level: 1, text: 'Grande' },
      { type: 'h', level: 2, text: 'Média' },
      { type: 'h', level: 3, text: 'Pequena' },
    ]);
  });

  it('mais de três # cai para o menor título disponível', () => {
    expect(parseBlocks('##### Fundo', 'headings')).toEqual([
      { type: 'h', level: 3, text: 'Fundo' },
    ]);
  });

  it('sem espaço depois do # não é título — é texto', () => {
    expect(parseBlocks('#SemEspaco', 'headings')).toEqual([{ type: 'p', lines: ['#SemEspaco'] }]);
  });

  it('no modo hashtags o "# " não vira título', () => {
    expect(parseBlocks('# Não é título', 'hashtags')).toEqual([
      { type: 'p', lines: ['# Não é título'] },
    ]);
  });
});

describe('richtext: inline', () => {
  it('negrito, itálico e texto convivem', () => {
    expect(parseInline('um **dois** três *quatro* _cinco_', 'hashtags')).toEqual([
      { kind: 'text', text: 'um ' },
      { kind: 'strong', text: 'dois' },
      { kind: 'text', text: ' três ' },
      { kind: 'em', text: 'quatro' },
      { kind: 'text', text: ' ' },
      { kind: 'em', text: 'cinco' },
    ]);
  });

  it('#hashtag é destacada na comunidade', () => {
    expect(parseInline('vamos #coxilharica', 'hashtags')).toEqual([
      { kind: 'text', text: 'vamos ' },
      { kind: 'tag', text: '#coxilharica' },
    ]);
  });

  it('na descrição do roteiro a hashtag inline é texto comum', () => {
    expect(parseInline('vamos #coxilharica', 'headings')).toEqual([
      { kind: 'text', text: 'vamos #coxilharica' },
    ]);
  });
});

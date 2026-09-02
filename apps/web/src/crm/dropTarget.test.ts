import { describe, expect, it } from 'vitest';
import { dropTarget, type ColumnBounds } from './dropTarget.js';

/**
 * OP-05 — onde o cartão cai.
 *
 * A parte de arrastar que dá para testar de verdade é esta: dada a posição do ponteiro e
 * onde cada coluna está na tela, qual coluna recebe. O resto (capturar o ponteiro, mover o
 * elemento) é DOM e não tem regra dentro.
 *
 * O projeto não tinha nada de arrastar, e a escolha foi não trazer biblioteca: o
 * `@dnd-kit` está 21 meses sem lançamento, e num repositório que roda `pnpm audit` no CI e
 * confere política de supply-chain no lockfile isso é dívida. Pointer events cobrem mouse,
 * toque e caneta na mesma API — o app empacotado pelo Capacitor depende disso.
 */

const COLUNAS: ColumnBounds[] = [
  { stageId: 's-novo', kind: 'open', left: 0, right: 300 },
  { stageId: 's-conversa', kind: 'open', left: 316, right: 616 },
  { stageId: 's-ganho', kind: 'won', left: 632, right: 932 },
];

describe('OP-05: coluna sob o ponteiro', () => {
  it('dentro de uma coluna, é ela', () => {
    expect(dropTarget(150, COLUNAS)).toEqual({ stageId: 's-novo', allowed: true });
    expect(dropTarget(400, COLUNAS)).toEqual({ stageId: 's-conversa', allowed: true });
  });

  it('na borda esquerda ainda conta como dentro — soltar no limite não pode falhar', () => {
    expect(dropTarget(0, COLUNAS)).toMatchObject({ stageId: 's-novo' });
    expect(dropTarget(300, COLUNAS)).toMatchObject({ stageId: 's-novo' });
  });

  it('no vão entre colunas, vale a mais próxima — o dedo não acerta 16px', () => {
    // 308 está no meio do vão de 16px entre 300 e 316.
    expect(dropTarget(308, COLUNAS)).toMatchObject({ stageId: 's-novo' });
    expect(dropTarget(312, COLUNAS)).toMatchObject({ stageId: 's-conversa' });
  });

  it('fora do quadro inteiro não é lugar nenhum', () => {
    expect(dropTarget(-200, COLUNAS)).toBeNull();
    expect(dropTarget(1400, COLUNAS)).toBeNull();
  });

  it('coluna de ganho é alvo, mas não permitido — a tela avisa em vez de sumir com ela', () => {
    /*
     * Fechar gera a inscrição (OP-08), então soltar ali é recusado. Devolver a coluna com
     * `allowed: false`, e não `null`, é o que permite à tela mostrar por que não pode. Um
     * alvo que simplesmente não reage deixa a pessoa achando que o arrastar quebrou.
     */
    expect(dropTarget(700, COLUNAS)).toEqual({ stageId: 's-ganho', allowed: false });
  });

  it('sem colunas, não há alvo', () => {
    expect(dropTarget(100, [])).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { brl } from './money.js';

/**
 * O formatador de dinheiro da interface. Existia copiado em dez telas, e foi assim que uma
 * cópia divergiu: no extrato da inscrição o agrupamento de milhar estava escrito
 * `B(?=(d{3})+(?!d))` — sem as contrabarras —, então nada agrupava e a mesa mostrava
 * `2392,47` ao lado de `3.580,00` na linha de cima.
 *
 * Dinheiro é o dado que este sistema existe para acertar. Uma função só, testada.
 */
describe('brl: centavos para leitura', () => {
  it('agrupa o milhar', () => {
    expect(brl(239247)).toBe('2.392,47');
  });

  it('agrupa milhão e mantém os dois centavos', () => {
    expect(brl(123456789)).toBe('1.234.567,89');
  });

  it('abaixo de mil não ganha ponto', () => {
    expect(brl(69000)).toBe('690,00');
  });

  it('centavo com zero à esquerda não some', () => {
    expect(brl(1005)).toBe('10,05');
  });

  it('zero', () => {
    expect(brl(0)).toBe('0,00');
  });

  /** Devolução e conversão entram negativas no ledger: o sinal tem que aparecer. */
  it('negativo mostra o sinal antes do valor, não do agrupamento', () => {
    expect(brl(-239247)).toBe('-2.392,47');
  });

  it('não inventa "R$" — quem precisa do símbolo escreve na frente', () => {
    expect(brl(150000)).not.toContain('R$');
  });
});

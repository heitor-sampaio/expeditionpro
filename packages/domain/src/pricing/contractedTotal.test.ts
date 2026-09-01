import { describe, it, expect } from 'vitest';
import { cents, InvalidCentsError, zeroCents } from '../money/cents.js';
import { contractedTotal } from './contractedTotal.js';

/**
 * CP-05 — o valor contratado da inscrição. Antes do cupom, "contratado" era a soma dos
 * unitários congelados espalhada por uma dúzia de leitores; com desconto, a derivação
 * precisa de um dono só, senão duas telas divergem no dia em que alguém esquecer de
 * subtrair. Esta função é esse dono.
 */
describe('CP-05: contratado = soma dos unitários − desconto', () => {
  const units = [cents(2_000_00), cents(0), cents(600_00)]; // COUPLE + par em zero + criança

  it('sem desconto, é a soma dos unitários congelados', () => {
    expect(contractedTotal(units, zeroCents)).toBe(2_600_00);
  });

  it('com desconto, subtrai sem tocar nos unitários', () => {
    expect(contractedTotal(units, cents(260_00))).toBe(2_340_00);
    // os unitários seguem intactos — o snapshot do participante é imutável (§3.4)
    expect(units).toEqual([2_000_00, 0, 600_00]);
  });

  it('desconto maior que a soma não gera valor negativo — o piso é zero', () => {
    expect(contractedTotal(units, cents(9_999_00))).toBe(0);
  });

  it('lista vazia é zero', () => {
    expect(contractedTotal([], zeroCents)).toBe(0);
  });

  it('desconto negativo é recusado — desconto não é acréscimo', () => {
    expect(() => contractedTotal(units, cents(-100))).toThrow(InvalidCentsError);
  });
});

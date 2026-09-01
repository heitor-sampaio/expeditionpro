import { describe, it, expect } from 'vitest';
import {
  cents,
  zeroCents,
  addCents,
  subCents,
  sumCents,
  applyPercent,
  applyPercentFloor,
  formatBRL,
  InvalidCentsError,
} from './cents.js';

/**
 * Fundação financeira do sistema. Se `Cents` deixar float entrar, todo o resto —
 * preço, cashback, saldo — herda o erro. Por isso é o primeiro teste do projeto.
 */
describe('Cents — dinheiro em centavos, tipo branded', () => {
  it('cents() aceita inteiro (inclusive zero e negativo, para lançamentos do ledger)', () => {
    expect(cents(0)).toBe(0);
    expect(cents(12_345)).toBe(12_345);
    // resgate de cashback é lançamento negativo (CB-05)
    expect(cents(-500)).toBe(-500);
  });

  it('cents() rejeita float — impede somar reais com centavos por engano', () => {
    expect(() => cents(10.5)).toThrow(InvalidCentsError);
    expect(() => cents(0.1)).toThrow(InvalidCentsError);
  });

  it('cents() rejeita NaN, Infinity e valor fora do inteiro seguro', () => {
    expect(() => cents(Number.NaN)).toThrow(InvalidCentsError);
    expect(() => cents(Number.POSITIVE_INFINITY)).toThrow(InvalidCentsError);
    expect(() => cents(Number.MAX_SAFE_INTEGER + 1)).toThrow(InvalidCentsError);
  });

  it('zeroCents é a origem neutra', () => {
    expect(zeroCents).toBe(0);
    expect(addCents(zeroCents, cents(700))).toBe(700);
  });

  it('addCents e subCents preservam a soma exata (sem float)', () => {
    expect(addCents(cents(1990), cents(2010))).toBe(4000);
    expect(subCents(cents(5000), cents(1500))).toBe(3500);
  });

  it('sumCents soma uma lista e devolve zero para lista vazia', () => {
    expect(sumCents([cents(100), cents(200), cents(300)])).toBe(600);
    expect(sumCents([])).toBe(0);
  });

  it('applyPercent calcula percentual arredondando ao centavo (banker-safe: half-up)', () => {
    // 10% de R$ 100,00 = R$ 10,00
    expect(applyPercent(cents(10_000), 10)).toBe(1000);
    // 5% de R$ 199,90 = R$ 9,995 → 1000 (arredonda meio para cima)
    expect(applyPercent(cents(19_990), 5)).toBe(1000);
    // 0% é zero
    expect(applyPercent(cents(19_990), 0)).toBe(0);
  });

  it('applyPercent rejeita percentual negativo', () => {
    expect(() => applyPercent(cents(10_000), -1)).toThrow(InvalidCentsError);
  });

  it('CP-01: applyPercentFloor arredonda o percentual para BAIXO', () => {
    // 5% de R$ 199,90 = R$ 9,995 → 999, onde applyPercent daria 1000. Desconto que
    // sobra centavo é desconto maior que o combinado; falta é a favor da casa.
    expect(applyPercentFloor(cents(19_990), 5)).toBe(999);
    // Sem resto, os dois caminhos coincidem.
    expect(applyPercentFloor(cents(10_000), 10)).toBe(1000);
    expect(applyPercentFloor(cents(19_990), 0)).toBe(0);
    // 100% devolve a base inteira.
    expect(applyPercentFloor(cents(19_990), 100)).toBe(19_990);
  });

  it('CP-01: applyPercentFloor rejeita percentual negativo', () => {
    expect(() => applyPercentFloor(cents(10_000), -1)).toThrow(InvalidCentsError);
  });

  it('formatBRL formata em real com vírgula decimal e separador de milhar', () => {
    expect(formatBRL(cents(0))).toBe('R$ 0,00');
    expect(formatBRL(cents(12_345_67))).toBe('R$ 12.345,67');
    expect(formatBRL(cents(-500))).toBe('-R$ 5,00');
  });
});

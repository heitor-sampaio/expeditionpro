import { describe, it, expect } from 'vitest';
import { cents } from '../money/cents.js';
import { computeGroupResult } from './groupResult.js';

/**
 * GR-10: resultado do grupo = receita − gastos, margem bruta e percentual.
 * Tudo derivado, dinheiro em centavos. Percentual é métrica de exibição.
 */

describe('GR-10: computeGroupResult', () => {
  it('margem bruta = receita − gastos; percentual sobre a receita', () => {
    const r = computeGroupResult(cents(1000000), cents(600000));
    expect(r.grossMarginCents).toBe(400000);
    expect(r.marginPercent).toBe(40); // 400000 / 1000000
  });

  it('arredonda o percentual a uma casa', () => {
    const r = computeGroupResult(cents(300000), cents(200000));
    expect(r.grossMarginCents).toBe(100000);
    expect(r.marginPercent).toBe(33.3); // 100000/300000 = 33.33..
  });

  it('gasto maior que receita: margem negativa', () => {
    const r = computeGroupResult(cents(100000), cents(150000));
    expect(r.grossMarginCents).toBe(-50000);
    expect(r.marginPercent).toBe(-50);
  });

  it('receita zero: percentual nulo (não divide por zero)', () => {
    const r = computeGroupResult(cents(0), cents(50000));
    expect(r.grossMarginCents).toBe(-50000);
    expect(r.marginPercent).toBeNull();
  });

  it('sem gasto: margem = receita, 100%', () => {
    const r = computeGroupResult(cents(500000), cents(0));
    expect(r.grossMarginCents).toBe(500000);
    expect(r.marginPercent).toBe(100);
  });
});

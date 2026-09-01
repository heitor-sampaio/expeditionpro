import { describe, it, expect } from 'vitest';
import { cents } from '../money/cents.js';
import { parseLocalDate } from '../date/localDate.js';
import { resolvePriceCategory, calculateBookingTotal, type PriceTable } from './pricing.js';

/**
 * Núcleo financeiro (§3.4). Erro aqui é dinheiro errado — 100% de cobertura.
 * A idade é SEMPRE na data de início do grupo, nunca na inscrição nem em new Date().
 */

const BANDS = { childYoungMaxAge: 5, childMidMaxAge: 10 };

describe('§3.4: resolvePriceCategory — faixa etária na data de início do grupo', () => {
  const at = (birth: string, groupStart: string) =>
    resolvePriceCategory(parseLocalDate(birth), parseLocalDate(groupStart), BANDS);

  it('criança faixa menor: idade <= child_young_max (5)', () => {
    expect(at('2020-01-01', '2025-01-01')).toBe('child_young'); // 5
    expect(at('2022-06-01', '2025-01-01')).toBe('child_young'); // 2
  });

  it('criança faixa maior: child_young_max < idade <= child_mid_max (6–10)', () => {
    expect(at('2019-01-01', '2025-01-01')).toBe('child_mid'); // 6
    expect(at('2015-01-01', '2025-01-01')).toBe('child_mid'); // 10
  });

  it('adulto: idade > child_mid_max (11+)', () => {
    expect(at('2014-01-01', '2025-01-01')).toBe('adult'); // 11
    expect(at('1989-01-14', '2025-01-01')).toBe('adult');
  });

  it('a data de início do grupo é o que decide (aniversário antes da viagem)', () => {
    // nasce 2015-01-01 (10 anos no grupo de 2025), vira 11 no grupo de 2026
    expect(at('2015-01-01', '2025-06-01')).toBe('child_mid');
    expect(at('2015-01-01', '2026-06-01')).toBe('adult');
  });
});

describe('§3.4: calculateBookingTotal — casal/solo + adicionais', () => {
  const prices: PriceTable = {
    coupleCents: cents(200000),
    soloCents: cents(120000),
    extraAdultCents: cents(80000),
    childMidCents: cents(60000),
    childYoungCents: cents(40000),
  };
  const total = (bands: Array<'adult' | 'child_mid' | 'child_young'>) =>
    calculateBookingTotal(bands, prices);

  it('base casal cobre 2 adultos', () => {
    expect(total(['adult', 'adult'])).toBe(200000);
  });

  it('base solo cobre 1 adulto', () => {
    expect(total(['adult'])).toBe(120000);
  });

  it('3º adulto em diante é adulto adicional', () => {
    expect(total(['adult', 'adult', 'adult'])).toBe(280000); // couple + 1 extra
    expect(total(['adult', 'adult', 'adult', 'adult'])).toBe(360000); // couple + 2 extra
  });

  it('crianças somam por cabeça na faixa certa', () => {
    // couple + 1 child_mid + 2 child_young
    expect(total(['adult', 'adult', 'child_mid', 'child_young', 'child_young'])).toBe(
      200000 + 60000 + 40000 + 40000,
    );
  });

  it('solo + criança', () => {
    expect(total(['adult', 'child_mid'])).toBe(120000 + 60000);
  });

  it('sem adulto não aplica base (só as crianças)', () => {
    expect(total(['child_young', 'child_mid'])).toBe(40000 + 60000);
  });

  it('inscrição vazia é zero', () => {
    expect(total([])).toBe(0);
  });
});

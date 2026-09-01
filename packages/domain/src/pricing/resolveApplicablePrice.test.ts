import { describe, it, expect } from 'vitest';
import { cents } from '../money/cents.js';
import { parseLocalDate } from '../date/localDate.js';
import { resolveApplicablePrice, type PriceVersion, type PriceTable } from './pricing.js';

/**
 * Preços versionados por valid_from (§3.4): vale a versão mais recente cujo
 * valid_from é <= a data de início do grupo. Reajuste futuro não afeta saída anterior.
 */

const table = (couple: number): PriceTable => ({
  coupleCents: cents(couple),
  soloCents: cents(couple / 2),
  extraAdultCents: cents(0),
  childMidCents: cents(0),
  childYoungCents: cents(0),
});

const V2024: PriceVersion = { validFrom: parseLocalDate('2024-01-01'), prices: table(100000) };
const V2025: PriceVersion = { validFrom: parseLocalDate('2025-06-01'), prices: table(200000) };

describe('§3.4: resolveApplicablePrice — versão vigente na data', () => {
  const at = (date: string) => resolveApplicablePrice([V2025, V2024], parseLocalDate(date));

  it('escolhe a versão anterior quando a nova ainda não vigora', () => {
    expect(at('2025-01-01')?.coupleCents).toBe(100000); // antes de 2025-06
  });

  it('escolhe a nova versão a partir do valid_from', () => {
    expect(at('2025-06-01')?.coupleCents).toBe(200000); // exatamente no valid_from
    expect(at('2025-12-31')?.coupleCents).toBe(200000);
  });

  it('devolve null quando nenhuma versão vigora ainda', () => {
    expect(at('2023-01-01')).toBeNull();
  });

  it('devolve null para lista vazia', () => {
    expect(resolveApplicablePrice([], parseLocalDate('2025-01-01'))).toBeNull();
  });

  it('a ordem da lista não importa: escolhe a mais recente que vigora', () => {
    const olderFirst = [V2024, V2025];
    expect(resolveApplicablePrice(olderFirst, parseLocalDate('2025-12-31'))?.coupleCents).toBe(
      200000,
    );
  });
});

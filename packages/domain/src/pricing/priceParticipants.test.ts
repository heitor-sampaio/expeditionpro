import { describe, it, expect } from 'vitest';
import { cents, sumCents } from '../money/cents.js';
import {
  calculateBookingTotal,
  priceParticipants,
  type AgeBand,
  type PriceTable,
} from './pricing.js';

/**
 * Snapshot por participante (§3.4): cada um recebe uma das 5 categorias e o valor
 * unitário congelado. A soma dos unitários é SEMPRE o total da inscrição — é o
 * invariante que amarra o snapshot ao cálculo.
 */

const prices: PriceTable = {
  coupleCents: cents(200000),
  soloCents: cents(120000),
  extraAdultCents: cents(80000),
  childMidCents: cents(60000),
  childYoungCents: cents(40000),
};

const categories = (bands: AgeBand[]) => priceParticipants(bands, prices).map((p) => p.category);
const units = (bands: AgeBand[]) => priceParticipants(bands, prices).map((p) => p.unitCents);

describe('§3.4: priceParticipants — snapshot por participante', () => {
  it('2 adultos = casal, com o preço do casal numa linha e o par em zero', () => {
    expect(categories(['adult', 'adult'])).toEqual(['COUPLE', 'COUPLE']);
    expect(units(['adult', 'adult'])).toEqual([200000, 0]);
  });

  it('1 adulto = solo', () => {
    expect(categories(['adult'])).toEqual(['SOLO']);
    expect(units(['adult'])).toEqual([120000]);
  });

  it('3º adulto em diante = adulto adicional', () => {
    expect(categories(['adult', 'adult', 'adult'])).toEqual(['COUPLE', 'COUPLE', 'EXTRA_ADULT']);
    expect(units(['adult', 'adult', 'adult'])).toEqual([200000, 0, 80000]);
  });

  it('crianças recebem a categoria e o unitário da sua faixa, na ordem', () => {
    const bands: AgeBand[] = ['adult', 'adult', 'child_mid', 'child_young'];
    expect(categories(bands)).toEqual(['COUPLE', 'COUPLE', 'CHILD_MID', 'CHILD_YOUNG']);
    expect(units(bands)).toEqual([200000, 0, 60000, 40000]);
  });

  it('sem adulto: só as crianças', () => {
    expect(categories(['child_young', 'child_mid'])).toEqual(['CHILD_YOUNG', 'CHILD_MID']);
    expect(units(['child_young', 'child_mid'])).toEqual([40000, 60000]);
  });

  it('invariante: a soma dos unitários é o total, em toda composição', () => {
    const compositions: AgeBand[][] = [
      ['adult', 'adult'],
      ['adult'],
      ['adult', 'adult', 'adult', 'adult'],
      ['adult', 'adult', 'child_mid', 'child_young', 'child_young'],
      ['child_young'],
      [],
    ];
    for (const bands of compositions) {
      expect(sumCents(units(bands))).toBe(calculateBookingTotal(bands, prices));
    }
  });
});

import { describe, it, expect } from 'vitest';
import { cents, sumCents } from '../money/cents.js';
import { parseLocalDate } from '../date/localDate.js';
import { priceBooking, type BookingParticipantInput, type PriceTable } from './pricing.js';

/**
 * priceBooking (§3.4) compõe a operação de snapshot da inscrição: resolve a faixa de
 * cada participante na data de início do grupo, atribui categoria e congela o unitário.
 * É o núcleo financeiro — 100% de cobertura. A soma dos unitários é sempre o total.
 */

const BANDS = { childYoungMaxAge: 5, childMidMaxAge: 10 };
const prices: PriceTable = {
  coupleCents: cents(200000),
  soloCents: cents(120000),
  extraAdultCents: cents(80000),
  childMidCents: cents(60000),
  childYoungCents: cents(40000),
};
const START = parseLocalDate('2025-11-10');

const p = (ref: string, birth: string): BookingParticipantInput => ({
  ref,
  birthDate: parseLocalDate(birth),
});

describe('§3.4: priceBooking — snapshot da inscrição na data do grupo', () => {
  it('casal: dois adultos, base numa linha e o par em zero, preservando ref e ordem', () => {
    const result = priceBooking([p('r', '1989-01-14'), p('c', '1990-05-20')], START, BANDS, prices);
    expect(result.total).toBe(200000);
    expect(result.participants.map((x) => x.ref)).toEqual(['r', 'c']);
    expect(result.participants.map((x) => x.category)).toEqual(['COUPLE', 'COUPLE']);
    expect(result.participants.map((x) => x.unitCents)).toEqual([200000, 0]);
    expect(result.participants.map((x) => x.ageBand)).toEqual(['adult', 'adult']);
  });

  it('família com adulto adicional e crianças de faixas diferentes', () => {
    const result = priceBooking(
      [
        p('r', '1989-01-14'), // adulto
        p('c', '1990-05-20'), // adulto
        p('a3', '2000-03-01'), // adulto adicional
        p('k1', '2016-01-01'), // 9 -> child_mid
        p('k2', '2021-01-01'), // 4 -> child_young
      ],
      START,
      BANDS,
      prices,
    );
    expect(result.participants.map((x) => x.category)).toEqual([
      'COUPLE',
      'COUPLE',
      'EXTRA_ADULT',
      'CHILD_MID',
      'CHILD_YOUNG',
    ]);
    expect(result.total).toBe(200000 + 80000 + 60000 + 40000);
  });

  it('a idade é resolvida na data de início do grupo (aniversário antes da viagem)', () => {
    // nasce 2015-01-01: 10 (child_mid) no grupo de 2025, 11 (adulto) no de 2026
    const em2025 = priceBooking(
      [p('k', '2015-01-01')],
      parseLocalDate('2025-06-01'),
      BANDS,
      prices,
    );
    const em2026 = priceBooking(
      [p('k', '2015-01-01')],
      parseLocalDate('2026-06-01'),
      BANDS,
      prices,
    );
    expect(em2025.participants[0]!.category).toBe('CHILD_MID');
    expect(em2026.participants[0]!.category).toBe('SOLO'); // vira adulto sozinho
  });

  it('invariante: a soma dos unitários é sempre o total', () => {
    const result = priceBooking(
      [p('r', '1989-01-14'), p('c', '1990-05-20'), p('k', '2021-01-01')],
      START,
      BANDS,
      prices,
    );
    expect(sumCents(result.participants.map((x) => x.unitCents))).toBe(result.total);
  });

  it('inscrição vazia: total zero, sem participantes', () => {
    const result = priceBooking([], START, BANDS, prices);
    expect(result.total).toBe(0);
    expect(result.participants).toEqual([]);
  });
});

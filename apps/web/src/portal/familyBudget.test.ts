import { describe, it, expect } from 'vitest';
import { cents } from '@expedition/domain';
import { familyBudget } from './familyBudget.js';
import type { PriceTableDto } from '../itineraries/useItineraryPrices.js';

/**
 * §3.4 — a estimativa que o cliente vê na vitrine usa **o mesmo algoritmo** do servidor:
 * casal/solo é a base (não é soma por cabeça) e adulto adicional/crianças entram por
 * pessoa. A idade sai da **data de início da saída**, não de hoje — quem faz 11 anos antes
 * da viagem já conta como adulto.
 *
 * É estimativa, não promessa: o valor definitivo é congelado na alocação (RO-03).
 */

const PRICES: PriceTableDto = {
  coupleCents: 389000,
  soloCents: 289000,
  extraAdultCents: 119000,
  childMidCents: 69000,
  childYoungCents: 0,
};

const BANDS = { childYoungMaxAge: 5, childMidMaxAge: 10 };

const adulto = (id: string) => ({ id, fullName: `A ${id}`, birthDate: '1988-03-04' });
const crianca = (id: string, birthDate: string) => ({ id, fullName: `C ${id}`, birthDate });

describe('§3.4: orçamento da família na vitrine', () => {
  it('dois adultos usam a base de casal', () => {
    const budget = familyBudget([adulto('1'), adulto('2')], PRICES, '2026-08-28', BANDS);
    expect(budget.totalCents).toBe(389000);
    expect(budget.lines.map((l) => l.band)).toEqual(['adult', 'adult']);
  });

  it('um adulto sozinho usa a base solo', () => {
    expect(familyBudget([adulto('1')], PRICES, '2026-08-28', BANDS).totalCents).toBe(289000);
  });

  it('casal + criança de 8 anos soma a criança maior à base', () => {
    const budget = familyBudget(
      [adulto('1'), adulto('2'), crianca('3', '2018-01-10')],
      PRICES,
      '2026-08-28',
      BANDS,
    );
    expect(budget.totalCents).toBe(389000 + 69000);
    expect(budget.lines[2]!.band).toBe('child_mid');
  });

  it('terceiro adulto entra como adulto adicional, não como nova base', () => {
    const budget = familyBudget(
      [adulto('1'), adulto('2'), adulto('3')],
      PRICES,
      '2026-08-28',
      BANDS,
    );
    expect(budget.totalCents).toBe(389000 + 119000);
  });

  it('a idade é a da data da saída: quem faz 11 antes da viagem conta como adulto', () => {
    const virandoAdulto = crianca('3', '2015-08-27'); // 11 anos em 27/08/2026
    const antes = familyBudget([adulto('1'), virandoAdulto], PRICES, '2026-08-26', BANDS);
    const depois = familyBudget([adulto('1'), virandoAdulto], PRICES, '2026-08-28', BANDS);
    expect(antes.lines[1]!.band).toBe('child_mid');
    expect(depois.lines[1]!.band).toBe('adult');
    expect(depois.totalCents).toBe(389000); // virou casal
  });

  it('criança em faixa de cortesia não soma nada', () => {
    const budget = familyBudget(
      [adulto('1'), adulto('2'), crianca('3', '2023-05-05')],
      PRICES,
      '2026-08-28',
      BANDS,
    );
    expect(budget.lines[2]!.band).toBe('child_young');
    expect(budget.totalCents).toBe(389000);
    expect(budget.lines[2]!.unitCents).toBe(cents(0));
  });

  it('família vazia não tem orçamento', () => {
    expect(familyBudget([], PRICES, '2026-08-28', BANDS).totalCents).toBe(0);
  });
});

import {
  calculateBookingTotal,
  cents,
  parseLocalDate,
  priceParticipants,
  resolvePriceCategory,
  type AgeBand,
  type Cents,
} from '@expedition/domain';
import type { PriceTableDto } from '../itineraries/useItineraryPrices.js';

/**
 * Estimativa do valor para a família (§3.4), calculada com **as funções do domínio** — as
 * mesmas que o servidor usa na alocação. Reimplementar a conta aqui seria criar uma segunda
 * verdade sobre dinheiro.
 *
 * A idade sai da **data de início da saída**, nunca de hoje. E o valor é estimativa: o
 * definitivo é congelado quando a inscrição é alocada (RO-03).
 */

export interface BudgetMember {
  readonly id: string;
  readonly fullName: string;
  readonly birthDate: string; // ISO YYYY-MM-DD
}

export interface BudgetLine {
  readonly id: string;
  readonly fullName: string;
  readonly band: AgeBand;
  readonly unitCents: Cents;
}

export interface Budget {
  readonly totalCents: number;
  readonly lines: readonly BudgetLine[];
}

export interface AgeBandsInput {
  readonly childYoungMaxAge: number;
  readonly childMidMaxAge: number;
}

export function familyBudget(
  members: readonly BudgetMember[],
  prices: PriceTableDto,
  startDateIso: string,
  bands: AgeBandsInput,
): Budget {
  if (members.length === 0) return { totalCents: 0, lines: [] };

  const at = parseLocalDate(startDateIso);
  const table = toPriceTable(prices);
  const resolved = members.map((m) => resolvePriceCategory(parseLocalDate(m.birthDate), at, bands));
  const unit = priceParticipants(resolved, table);

  return {
    totalCents: Number(calculateBookingTotal(resolved, table)),
    lines: members.map((member, i) => ({
      id: member.id,
      fullName: member.fullName,
      band: resolved[i]!,
      unitCents: unit[i]?.unitCents ?? cents(0),
    })),
  };
}

/** Rótulo da faixa para a tela, com os anos configurados no roteiro. */
export function bandLabel(band: AgeBand, bands: AgeBandsInput): string {
  if (band === 'child_young') return `criança até ${bands.childYoungMaxAge} anos`;
  if (band === 'child_mid') {
    return `criança de ${bands.childYoungMaxAge + 1} a ${bands.childMidMaxAge} anos`;
  }
  return 'adulto';
}

function toPriceTable(prices: PriceTableDto) {
  return {
    coupleCents: cents(prices.coupleCents),
    soloCents: cents(prices.soloCents),
    extraAdultCents: cents(prices.extraAdultCents),
    childMidCents: cents(prices.childMidCents),
    childYoungCents: cents(prices.childYoungCents),
  };
}

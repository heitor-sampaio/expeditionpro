import { cents, parseLocalDate } from '@expedition/domain';
import type { ItineraryRepository, NewPriceVersion } from './itineraryRepository.js';

/** Entrada de preço na borda: centavos como número, validez como ISO. */
export interface PriceInput {
  readonly validFrom: string;
  readonly coupleCents: number;
  readonly soloCents: number;
  readonly extraAdultCents: number;
  readonly childMidCents: number;
  readonly childYoungCents: number;
}

export interface ItineraryDeps {
  readonly itineraries: ItineraryRepository;
}

/** Converte a entrada crua em versão de preço do domínio (Cents + LocalDate). */
export function toPriceVersion(input: PriceInput): NewPriceVersion {
  return {
    validFrom: parseLocalDate(input.validFrom),
    prices: {
      coupleCents: cents(input.coupleCents),
      soloCents: cents(input.soloCents),
      extraAdultCents: cents(input.extraAdultCents),
      childMidCents: cents(input.childMidCents),
      childYoungCents: cents(input.childYoungCents),
    },
  };
}

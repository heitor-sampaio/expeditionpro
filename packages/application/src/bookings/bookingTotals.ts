import { contractedTotal, sumCents, zeroCents, type Cents } from '@expedition/domain';
import type { BookingRecord } from './bookingRepository.js';

/**
 * O valor de uma inscrição, num lugar só (§3.4 · CP-05).
 *
 * Antes do cupom, cada leitor somava os unitários por conta própria; com desconto, essa
 * repetição vira divergência — a mesa mostrando um número e o financeiro outro. Toda
 * leitura de "quanto vale esta inscrição" passa por aqui.
 */

/** Soma dos unitários congelados: o que a tabela de preços dizia no dia (sem desconto). */
export function bookingSubtotal(booking: BookingRecord): Cents {
  return sumCents(booking.participants.map((participant) => participant.unitPriceCents));
}

/** CP-05: desconto em vigor na inscrição. Zero quando não há cupom aplicado. */
export function bookingDiscount(booking: BookingRecord): Cents {
  return booking.discount?.discountCents ?? zeroCents;
}

/** O contratado: subtotal menos desconto, nunca negativo. */
export function bookingContracted(booking: BookingRecord): Cents {
  return contractedTotal(
    booking.participants.map((participant) => participant.unitPriceCents),
    bookingDiscount(booking),
  );
}

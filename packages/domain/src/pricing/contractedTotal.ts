import { cents, InvalidCentsError, sumCents, type Cents } from '../money/cents.js';

/**
 * Valor contratado da inscrição (§3.4 · CP-05): a soma dos unitários congelados menos
 * o desconto aplicado. Uma função só, porque o contratado é lido em mesa, financeiro,
 * cashback, cobrança e ficha do cliente — derivação repetida à mão é como duas telas
 * passam a discordar sobre quanto a família deve.
 *
 * O desconto **não** é distribuído entre os participantes: o snapshot deles é imutável.
 */
export function contractedTotal(unitCents: readonly Cents[], discountCents: Cents): Cents {
  if (discountCents < 0) {
    throw new InvalidCentsError(
      `Desconto deve ser não-negativo; recebido: ${String(discountCents)}`,
    );
  }
  const subtotal = sumCents(unitCents);
  return cents(Math.max(0, subtotal - discountCents));
}

import {
  cents,
  discountFromPercent,
  distributeDiscount,
  InvalidCentsError,
  sumCents,
  type Cents,
} from '@expedition/domain';
import { BusinessRuleError, ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { PaymentRepository } from '../payments/paymentRepository.js';
import type {
  BookingRecord,
  BookingRepository,
  ParticipantPriceOverride,
} from './bookingRepository.js';

/**
 * GR-04 — o desconto de balcão: a casa refaz o preço de uma inscrição, em percentual ou
 * em reais, com motivo obrigatório.
 *
 * A equipe negocia sobre o **total** ("dou 10% para essa família"), e é assim que o
 * formulário pergunta. O que o banco guarda continua sendo o unitário de cada
 * participante (§3.4), então o rateio é do domínio (`distributeDiscount`) — deixar essa
 * conta na tela seria lógica de negócio em componente, e duas telas divergindo no
 * centavo.
 *
 * **Não confundir com o cupom (CP-05).** O cupom é campanha que o *cliente* resgata e
 * entra como resgate, deixando o snapshot intacto. Isto aqui é reprecificação: a origem
 * do preço vira `override` e o motivo fica gravado na linha. Uma é desconto que o cliente
 * traz, a outra é desconto que a casa dá.
 */

export interface DiscountBookingTotalDeps {
  readonly bookings: BookingRepository;
  readonly payments: PaymentRepository;
  readonly audit: AuditLogRepository;
}

export type DiscountMode = 'percent' | 'fixed';

export interface DiscountBookingTotalCommand {
  readonly bookingId: string;
  readonly reason: string;
  readonly mode: DiscountMode;
  /** Percentual de 0 a 100 quando `percent`; centavos a abater quando `fixed`. */
  readonly value: number;
}

export interface DiscountedBooking {
  readonly booking: BookingRecord;
  readonly totalCents: Cents;
  readonly discountCents: Cents;
}

export async function discountBookingTotal(
  deps: DiscountBookingTotalDeps,
  ctx: RequestContext,
  command: DiscountBookingTotalCommand,
): Promise<DiscountedBooking> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Dar desconto exige owner ou admin');
  }

  const reason = command.reason.trim();
  if (reason.length === 0) {
    throw new RequiredFieldError('motivo');
  }

  const booking = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  if (!booking) {
    throw new NotFoundError('inscrição');
  }
  if (booking.status === 'cancelled') {
    throw new BusinessRuleError('booking_cancelled', 'Inscrição cancelada não é reprecificada');
  }

  const unitPrices = booking.participants.map((participant) => participant.unitPriceCents);
  const subtotal = sumCents(unitPrices);
  const discountCents = resolveDiscount(command, subtotal);

  if (discountCents <= 0) {
    throw new BusinessRuleError('empty_discount', 'Informe um desconto maior que zero');
  }
  if (discountCents > subtotal) {
    throw new BusinessRuleError('discount_above_total', 'O desconto passa do valor da inscrição');
  }

  // Mesma trava do cupom (CP-07): descontar abaixo do que já entrou produziria saldo
  // negativo, que o sistema leria como "a empresa deve". Devolução é outro caminho (§3.6).
  const received = sumCents(
    (await deps.payments.listByBooking(ctx.tenantId, booking.id)).map(
      (payment) => payment.amountCents,
    ),
  );
  const total = cents(subtotal - discountCents);
  if (total < received) {
    throw new BusinessRuleError(
      'discount_below_received',
      'O desconto deixaria a inscrição abaixo do que já foi recebido',
    );
  }

  const novos = distributeDiscount(unitPrices, discountCents);
  const overrides: ParticipantPriceOverride[] = booking.participants.map((participant, index) => ({
    customerId: participant.customerId,
    unitPriceCents: novos[index]!,
    priceNote: reason,
  }));

  const updated = await deps.bookings.applyParticipantOverrides(
    ctx.tenantId,
    booking.id,
    overrides,
  );
  const totalCents = sumCents(updated.participants.map((p) => p.unitPriceCents));

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'booking',
    entityId: booking.id,
    action: 'booking.discount',
    // De quanto para quanto, e por quê: é o que responde "quem baixou o valor desta
    // inscrição" seis meses depois. Sem dado pessoal — só dinheiro e motivo.
    diff: {
      mode: command.mode,
      value: command.value,
      discountCents: Number(discountCents),
      fromCents: Number(subtotal),
      toCents: Number(totalCents),
      reason,
    },
  });

  return { booking: updated, totalCents, discountCents };
}

/** Converte o que a tela pediu em centavos a abater. */
function resolveDiscount(command: DiscountBookingTotalCommand, subtotal: Cents): Cents {
  if (command.mode === 'percent') {
    try {
      return discountFromPercent(subtotal, command.value);
    } catch (error) {
      if (error instanceof InvalidCentsError) {
        throw new BusinessRuleError('invalid_percent', 'O percentual precisa estar entre 0 e 100');
      }
      throw error;
    }
  }
  if (!Number.isInteger(command.value) || command.value < 0) {
    throw new BusinessRuleError('invalid_amount', 'O desconto precisa ser um valor não negativo');
  }
  return cents(command.value);
}

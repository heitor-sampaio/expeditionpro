import { cents, parseLocalDate, sumCents, zeroCents } from '@expedition/domain';
import { BusinessRuleError, ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { CashbackRepository } from '../cashback/cashbackRepository.js';
import type { PaymentRepository } from './paymentRepository.js';

/**
 * §3.6 — devolve o que já entrou. O caso típico é a saída cancelada: até a devolução
 * ser lançada, o dinheiro segue no caixa e a inscrição segue somando receita; o que
 * muda o número é este lançamento.
 *
 * Dois destinos:
 * - `cash` — o dinheiro sai. Contrapartida negativa no ledger, e o recebido líquido cai.
 * - `cashback` — o dinheiro fica, mas deixa de ser receita: vira **crédito do cliente**
 *   (passivo). Nunca é despesa — despesa é o que se paga a fornecedor.
 *
 * Em ambos, o recebimento original **permanece** no ledger: histórico é imutável, e a
 * devolução é uma contrapartida, não um apagão. Devolveu tudo, a inscrição é cancelada
 * no mesmo ato — dinheiro devolvido com inscrição ainda de pé é estado inconsistente.
 */

export type RefundDestination = 'cash' | 'cashback';

export interface RegisterRefundCommand {
  readonly bookingId: string;
  readonly amountCents: number;
  readonly destination: RefundDestination;
  /** Forma da saída de caixa (pix|boleto|card|cash); irrelevante na conversão em crédito. */
  readonly method?: string | undefined;
  readonly paidAt: string; // ISO YYYY-MM-DD
  readonly reason: string;
}

export interface RegisterRefundDeps {
  readonly payments: PaymentRepository;
  readonly bookings: BookingRepository;
  readonly cashback: CashbackRepository;
  readonly clock: () => Date;
}

export interface RefundResult {
  readonly refundId: string;
  readonly netReceivedCents: number;
  readonly bookingCancelled: boolean;
}

export async function registerRefund(
  deps: RegisterRefundDeps,
  ctx: RequestContext,
  command: RegisterRefundCommand,
): Promise<RefundResult> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Devolução exige owner ou admin');
  }

  if (!Number.isInteger(command.amountCents) || command.amountCents <= 0) {
    throw new BusinessRuleError('invalid_amount', 'Valor da devolução deve ser positivo');
  }
  const reason = command.reason.trim();
  if (reason.length === 0) throw new RequiredFieldError('motivo');

  const booking = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  if (!booking) throw new NotFoundError('inscrição');

  const before = await deps.payments.listByBooking(ctx.tenantId, command.bookingId);
  const received = sumCents(before.map((p) => p.amountCents));
  if (command.amountCents > received) {
    throw new BusinessRuleError(
      'refund_exceeds_received',
      'A devolução não pode passar do que foi recebido',
    );
  }

  const refund = await deps.payments.create(
    {
      tenantId: ctx.tenantId,
      bookingId: booking.id,
      paidAt: parseLocalDate(command.paidAt),
      // Contrapartida: o sinal é o que faz toda soma de "recebido" já sair líquida.
      amountCents: cents(-command.amountCents),
      kind: command.destination === 'cashback' ? 'cashback' : 'refund',
      method: command.destination === 'cashback' ? 'cashback' : (command.method ?? 'pix'),
      reference: null,
      notes: reason,
      createdBy: actor.userId,
    },
    null,
  );

  if (command.destination === 'cashback') {
    // Crédito do cliente, não bônus: entra disponível e não expira.
    await deps.cashback.addEntry({
      tenantId: ctx.tenantId,
      customerId: booking.responsibleCustomerId,
      bookingId: booking.id,
      type: 'adjustment',
      amountCents: cents(command.amountCents),
      availableFrom: null,
      expiresAt: null,
      notes: `Devolução convertida em crédito: ${reason}`,
      createdBy: actor.userId,
    });
  }

  const net = received - command.amountCents;
  const cancelled = net === zeroCents && booking.status !== 'cancelled';
  if (cancelled) {
    await deps.bookings.cancel(ctx.tenantId, booking.id, {
      cancelledBy: actor.userId,
      cancelledAt: deps.clock(),
      reason: `Devolução integral: ${reason}`,
    });
  }

  return { refundId: refund.id, netReceivedCents: net, bookingCancelled: cancelled };
}

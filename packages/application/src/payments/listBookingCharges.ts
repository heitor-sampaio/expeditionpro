import type { LocalDate } from '@expedition/domain';
import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { PaymentChargeRepository } from './paymentChargeRepository.js';

/**
 * PG-06 — as cobranças emitidas para uma inscrição, na própria inscrição. É o que
 * responde "já mandamos cobrança para essa família?" sem sair do sistema.
 *
 * Bruto e líquido lado a lado, com a **taxa derivada** entre os dois — informação, não
 * despesa (decisão do dono): o que conta é o que foi cobrado e o que foi recebido.
 */

export interface BookingChargeView {
  readonly id: string;
  readonly externalId: string;
  /** O que o cliente paga. */
  readonly amountCents: number;
  /** O que deve sobrar depois das taxas do provedor. */
  readonly netAmountCents: number;
  /** A diferença entre os dois — derivada, nunca coluna. */
  readonly feeCents: number;
  readonly installments: number;
  readonly billingType: string;
  readonly dueDate: LocalDate;
  readonly status: string;
  readonly invoiceUrl: string | null;
  readonly paidAt: Date | null;
  readonly createdAt: Date;
  /** PG-07: o realizado, quando já conciliada. */
  readonly settledGrossCents: number | null;
  readonly settledNetCents: number | null;
  readonly awaitingCreditCents: number | null;
  readonly anticipationFeeCents: number | null;
  readonly paidInstallments: number | null;
  readonly creditedInstallments: number | null;
  readonly nextCreditDate: LocalDate | null;
  readonly reconciledAt: Date | null;
}

export interface ListBookingChargesDeps {
  readonly charges: PaymentChargeRepository;
}

export interface ListBookingChargesCommand {
  readonly bookingId: string;
}

export async function listBookingCharges(
  deps: ListBookingChargesDeps,
  ctx: RequestContext,
  command: ListBookingChargesCommand,
): Promise<BookingChargeView[]> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('As cobranças são da equipe');
  }
  const rows = await deps.charges.listByBooking(ctx.tenantId, command.bookingId);
  return rows.map(toView);
}

/** Compartilhado com o financeiro: a mesma cobrança, lida do mesmo jeito. */
export function toView(charge: {
  id: string;
  externalId: string;
  amountCents: number;
  netAmountCents: number;
  installments: number;
  billingType: string;
  dueDate: LocalDate;
  status: string;
  invoiceUrl: string | null;
  paidAt: Date | null;
  createdAt: Date;
  settledGrossCents: number | null;
  settledNetCents: number | null;
  awaitingCreditCents: number | null;
  anticipationFeeCents: number | null;
  paidInstallments: number | null;
  creditedInstallments: number | null;
  nextCreditDate: LocalDate | null;
  reconciledAt: Date | null;
}): BookingChargeView {
  return {
    id: charge.id,
    externalId: charge.externalId,
    amountCents: Number(charge.amountCents),
    netAmountCents: Number(charge.netAmountCents),
    feeCents: Number(charge.amountCents) - Number(charge.netAmountCents),
    installments: charge.installments,
    billingType: charge.billingType,
    dueDate: charge.dueDate,
    status: charge.status,
    invoiceUrl: charge.invoiceUrl,
    paidAt: charge.paidAt,
    createdAt: charge.createdAt,
    settledGrossCents: charge.settledGrossCents,
    settledNetCents: charge.settledNetCents,
    awaitingCreditCents: charge.awaitingCreditCents,
    anticipationFeeCents: charge.anticipationFeeCents,
    paidInstallments: charge.paidInstallments,
    creditedInstallments: charge.creditedInstallments,
    nextCreditDate: charge.nextCreditDate,
    reconciledAt: charge.reconciledAt,
  };
}

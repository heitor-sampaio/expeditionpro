import { ForbiddenError } from '../errors.js';
import { toView, type BookingChargeView } from './listBookingCharges.js';
import type { RequestContext } from '../context.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { PaymentChargeRepository } from './paymentChargeRepository.js';

/**
 * PG-06 — as cobranças emitidas, no financeiro da empresa. Cada linha se explica sozinha:
 * quem, qual saída, quanto foi cobrado e quanto deve sobrar.
 *
 * Cobrança **não é receita**: é promessa. O que entra no ledger é o recebimento, quando o
 * provedor avisa que foi paga (PG-03). Por isso esta lista vive ao lado do relatório, não
 * dentro dos totais dele.
 */

export interface ChargeReportRow extends BookingChargeView {
  readonly bookingId: string;
  readonly responsibleName: string;
  readonly groupName: string;
}

export interface ListRecentChargesDeps {
  readonly charges: PaymentChargeRepository;
  readonly bookings: BookingRepository;
  readonly customers: CustomerRepository;
  readonly schedule: ScheduleRepository;
}

export interface ListRecentChargesCommand {
  readonly limit?: number | undefined;
}

export async function listRecentCharges(
  deps: ListRecentChargesDeps,
  ctx: RequestContext,
  command: ListRecentChargesCommand = {},
): Promise<ChargeReportRow[]> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('O financeiro é da equipe');
  }

  const rows = await deps.charges.listRecent(ctx.tenantId, command.limit ?? 30);

  return Promise.all(
    rows.map(async (charge) => {
      // Inscrição apagada não derruba a lista: a cobrança aconteceu e continua sendo
      // registro. O que não dá para resolver vira travessão.
      const booking = await deps.bookings.findById(ctx.tenantId, charge.bookingId);
      const responsible = booking
        ? await deps.customers.findById(ctx.tenantId, booking.responsibleCustomerId)
        : null;
      const context = booking
        ? await deps.schedule.findGroupById(ctx.tenantId, booking.groupId)
        : null;

      return {
        ...toView(charge),
        bookingId: charge.bookingId,
        responsibleName: responsible?.fullName ?? '—',
        groupName: context?.group.name ?? '—',
      };
    }),
  );
}

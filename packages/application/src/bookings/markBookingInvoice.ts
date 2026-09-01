import { parseLocalDate } from '@expedition/domain';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { BookingInvoice, BookingRepository } from './bookingRepository.js';

/**
 * GR-06 — marca (ou desmarca) o check de NF de uma inscrição, gravando quem marcou e
 * quando; número e data de emissão são opcionais. Desmarcar limpa os metadados. Ação
 * da equipe (o cliente nunca mexe em NF).
 */

export interface MarkBookingInvoiceDeps {
  readonly bookings: BookingRepository;
  readonly clock: () => Date;
}

export interface MarkBookingInvoiceCommand {
  readonly bookingId: string;
  readonly checked: boolean;
  readonly invoiceNumber?: string | undefined;
  readonly issuedAt?: string | undefined;
}

export async function markBookingInvoice(
  deps: MarkBookingInvoiceDeps,
  ctx: RequestContext,
  command: MarkBookingInvoiceCommand,
): Promise<BookingInvoice> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('Check de NF é feito pela equipe');
  }

  const booking = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  if (!booking) {
    throw new NotFoundError('inscrição');
  }

  const invoice: BookingInvoice = command.checked
    ? {
        checked: true,
        checkedBy: ctx.actor.userId,
        checkedAt: deps.clock(),
        invoiceNumber: blankToNull(command.invoiceNumber),
        invoiceIssuedAt: command.issuedAt ? parseLocalDate(command.issuedAt) : null,
      }
    : {
        checked: false,
        checkedBy: null,
        checkedAt: null,
        invoiceNumber: null,
        invoiceIssuedAt: null,
      };

  return deps.bookings.setInvoiceCheck(ctx.tenantId, command.bookingId, invoice);
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

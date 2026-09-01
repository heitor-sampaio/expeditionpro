import { requireTeam } from '../audience.js';
import type { RequestContext } from '../context.js';
import type { PaymentRecord, PaymentRepository } from './paymentRepository.js';

/**
 * IN-11 · SEC-01 — os recebimentos ativos de uma inscrição, para escolher qual excluir na
 * mesa do grupo.
 *
 * Nasce aqui porque a rota lia o repositório direto, sem guarda e sem escopo de família: um
 * token de cliente lia o ledger de **qualquer** inscrição do tenant informando o id —
 * valores, forma, referência e o id da cobrança. A rota irmã que lista cobranças
 * (`listBookingCharges`) já exigia equipe; esta ficou para trás.
 *
 * Equipe, não escopo de família: é a mesa de conferência do back-office. O cliente vê o
 * próprio financeiro pelo portal, que tem caminho e recorte próprios.
 */

export interface ListBookingPaymentsDeps {
  readonly payments: PaymentRepository;
}

export interface ListBookingPaymentsCommand {
  readonly bookingId: string;
}

export async function listBookingPayments(
  deps: ListBookingPaymentsDeps,
  ctx: RequestContext,
  command: ListBookingPaymentsCommand,
): Promise<PaymentRecord[]> {
  requireTeam(ctx);
  return deps.payments.listByBooking(ctx.tenantId, command.bookingId);
}

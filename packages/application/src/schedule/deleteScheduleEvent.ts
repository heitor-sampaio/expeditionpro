import { BusinessRuleError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { PaymentRepository } from '../payments/paymentRepository.js';
import type { SupplierRepository } from '../suppliers/supplierRepository.js';
import type { IntakeRepository } from '../intake/intakeRepository.js';

/**
 * AG-04/AG-05 — exclui o evento (o grupo cai por cascade no banco).
 *
 * O que impede é **inscrição ativa** ou **dinheiro movimentado**: recebido de cliente ou
 * pago a fornecedor. Inscrição cancelada não segura a saída — ela já saiu do grupo, e o
 * registro dela vive na lista de inscrições, não aqui.
 *
 * Dinheiro é diferente: recebimento e pagamento são ledger, e apagar o grupo levaria os
 * lançamentos junto. Havendo qualquer um, a saída é **cancelar** o grupo (`cancelGroup`).
 * Gasto apenas contratado (sem pagamento) não bloqueia: é compromisso, não caixa.
 */

export interface DeleteScheduleEventDeps {
  readonly schedule: ScheduleRepositoryLike;
  readonly bookings: BookingRepository;
  readonly suppliers: SupplierRepository;
  readonly payments: PaymentRepository;
  readonly intake: IntakeRepository;
}

interface ScheduleRepositoryLike {
  findEventById(tenantId: string, id: string): Promise<{ group: { id: string } } | null>;
  deleteEvent(tenantId: string, eventId: string): Promise<void>;
}

export interface DeleteScheduleEventCommand {
  readonly eventId: string;
}

export async function deleteScheduleEvent(
  deps: DeleteScheduleEventDeps,
  ctx: RequestContext,
  command: DeleteScheduleEventCommand,
): Promise<void> {
  const event = await deps.schedule.findEventById(ctx.tenantId, command.eventId);
  if (!event) {
    throw new NotFoundError('evento');
  }

  const bookings = await deps.bookings.listByGroup(ctx.tenantId, event.group.id);
  const active = bookings.filter((booking) => !isCancelled(booking.status));
  if (active.length > 0) {
    throw new BusinessRuleError(
      'group_has_bookings',
      'Grupo com inscrição ativa não pode ser excluído — cancele a saída',
    );
  }

  const received = await deps.payments.listByGroup(ctx.tenantId, event.group.id);
  const paidToSuppliers = await deps.suppliers.listPaymentsByGroup(ctx.tenantId, event.group.id);
  if (received.length > 0 || paidToSuppliers.length > 0) {
    throw new BusinessRuleError(
      'group_has_money',
      'Grupo com dinheiro lançado não pode ser excluído — cancele a saída',
    );
  }

  // §5.8: pedido do app para uma saída que deixou de existir não tem o que aprovar — e
  // deixaria o cliente vendo "em análise" para sempre.
  const pending = await deps.intake.listPendingRequestsByGroup(ctx.tenantId, event.group.id);
  for (const request of pending) {
    await deps.intake.markDiscarded(ctx.tenantId, request.id, 'Saída excluída pela equipe');
  }

  await deps.schedule.deleteEvent(ctx.tenantId, command.eventId);
}

/** Cancelada ou recusada: saiu do grupo e não impede a exclusão. */
function isCancelled(status: string): boolean {
  return status === 'cancelled' || status === 'rejected';
}

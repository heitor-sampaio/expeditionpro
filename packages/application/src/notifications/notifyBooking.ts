import { NotFoundError } from '../errors.js';
import type { LocalDate } from '@expedition/domain';
import type { RequestContext } from '../context.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { NotificationGateway } from './notificationGateway.js';

/**
 * PC-23 — dispara a notificação de uma inscrição ao responsável ("recebida" na criação,
 * "confirmada" no primeiro recebimento). Resolve e-mail/nome do responsável e o roteiro/
 * datas do grupo. Sem e-mail no cadastro, apenas não envia (`sent: false`). O envio em si
 * é best-effort no chamador — este caso de uso não engole a falha do provedor.
 */

export interface NotifyBookingDeps {
  readonly bookings: BookingRepository;
  readonly customers: CustomerRepository;
  readonly schedule: ScheduleRepository;
  readonly notifications: NotificationGateway;
}

export interface NotifyBookingCommand {
  readonly bookingId: string;
  readonly kind: 'received' | 'confirmed';
}

export async function notifyBooking(
  deps: NotifyBookingDeps,
  ctx: RequestContext,
  command: NotifyBookingCommand,
): Promise<{ sent: boolean }> {
  const booking = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  if (!booking) throw new NotFoundError('inscrição');

  const customer = await deps.customers.findById(ctx.tenantId, booking.responsibleCustomerId);
  const email = customer?.email?.trim();
  if (!customer || !email) {
    return { sent: false };
  }

  const group = await deps.schedule.findGroupById(ctx.tenantId, booking.groupId);
  if (!group) throw new NotFoundError('grupo');

  await deps.notifications.sendBookingNotification({
    kind: command.kind,
    to: email,
    customerName: customer.fullName,
    groupName: group.group.name,
    startDate: iso(group.event.startDate),
    endDate: iso(group.event.endDate),
  });
  return { sent: true };
}

function iso(date: LocalDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

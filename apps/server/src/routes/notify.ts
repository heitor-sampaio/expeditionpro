import { notifyBooking } from '@expedition/application';
import type { RequestContext } from '@expedition/application';
import type { FastifyBaseLogger } from 'fastify';
import type { ServerDeps } from '../buildServer.js';

/**
 * Dispara a notificação de uma inscrição (PC-23) de forma **best-effort**: sem provedor
 * configurado, não faz nada; com provedor, uma falha de envio é logada e engolida — nunca
 * derruba a operação de negócio (alocação, recebimento) que já concluiu com sucesso.
 */
export async function fireBookingNotification(
  deps: ServerDeps,
  log: FastifyBaseLogger,
  ctx: RequestContext,
  bookingId: string,
  kind: 'received' | 'confirmed',
): Promise<void> {
  if (!deps.notifications) return;
  try {
    await notifyBooking(
      {
        bookings: deps.bookings,
        customers: deps.customers,
        schedule: deps.schedule,
        notifications: deps.notifications,
      },
      ctx,
      { bookingId, kind },
    );
  } catch (error) {
    log.warn({ err: error, bookingId, kind }, 'notificação de inscrição falhou (best-effort)');
  }
}

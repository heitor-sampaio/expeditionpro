import type { BookingNotification, NotificationGateway } from '@expedition/application';

/** Notificações em memória — SÓ para dev e testes de rota. Registra o que "enviaria". */
export function inMemoryNotifications(): NotificationGateway & { sent: BookingNotification[] } {
  const sent: BookingNotification[] = [];
  return {
    sent,
    sendBookingNotification(notification: BookingNotification): Promise<void> {
      sent.push(notification);
      return Promise.resolve();
    },
  };
}

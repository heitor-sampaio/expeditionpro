import type { BookingNotification, NotificationGateway } from './notificationGateway.js';

/** Fake in-memory do port de notificações — guarda o que foi enviado. Fora do build. */
export function fakeNotificationGateway(seed?: { failing?: boolean }): NotificationGateway & {
  sent: BookingNotification[];
} {
  const sent: BookingNotification[] = [];
  return {
    sent,
    sendBookingNotification(notification: BookingNotification): Promise<void> {
      if (seed?.failing) return Promise.reject(new Error('provedor fora do ar'));
      sent.push(notification);
      return Promise.resolve();
    },
  };
}

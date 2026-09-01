/**
 * Port de notificações ao cliente (PC-23). E-mails transacionais: "inscrição recebida"
 * na criação e "inscrição confirmada" no primeiro recebimento. É I/O de borda — a infra
 * implementa via provedor (Resend/SMTP). O envio é **best-effort**: falhar aqui nunca
 * derruba a operação de negócio que o disparou.
 */

export interface BookingNotification {
  readonly kind: 'received' | 'confirmed';
  readonly to: string; // e-mail do responsável
  readonly customerName: string;
  readonly groupName: string;
  readonly startDate: string; // ISO YYYY-MM-DD
  readonly endDate: string;
}

export interface NotificationGateway {
  sendBookingNotification(notification: BookingNotification): Promise<void>;
}

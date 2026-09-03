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

/**
 * AU-13 — o aviso à equipe.
 *
 * Porto separado do de cliente de propósito. `BookingNotification` tem audiência (o cliente),
 * assunto fechado (`received`/`confirmed`) e texto do sistema; isto tem audiência interna,
 * texto livre escrito pela equipe e vários destinatários. Enfiar os dois na mesma interface
 * faria um assunto opcional em toda notificação de inscrição, para servir a um caso que não é
 * o dela.
 */
export interface TeamNotice {
  /** Os e-mails da equipe do tenant. Nunca vem de fora: sai de `memberships`. */
  readonly to: readonly string[];
  readonly text: string;
}

export interface TeamNoticeGateway {
  sendTeamNotice(notice: TeamNotice): Promise<void>;
}

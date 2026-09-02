import type { BookingNotification, NotificationGateway } from '@expedition/application';
import { OUTBOUND_TIMEOUT_MS } from '../outbound.js';

/**
 * Notificações via Resend (PC-23). Chamada REST direta (fetch): a API key é segredo, só
 * no servidor. Os valores dinâmicos (nome, roteiro) são **escapados** no HTML — vêm do
 * nosso banco, mas escapar fecha injeção por dado de tenant. Erro do provedor propaga; o
 * chamador trata como best-effort (não derruba a operação de negócio).
 */

export interface ResendConfig {
  readonly apiKey: string;
  readonly from: string; // remetente verificado no Resend
  /** Injetável para o teste de prazo; em produção é o `fetch` do runtime. */
  readonly fetchImpl?: typeof fetch | undefined;
  readonly timeoutMs?: number | undefined;
}

export function resendNotificationGateway(config: ResendConfig): NotificationGateway {
  const call = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? OUTBOUND_TIMEOUT_MS;
  return {
    async sendBookingNotification(notification: BookingNotification): Promise<void> {
      const { subject, html } = render(notification);
      const res = await call('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ from: config.from, to: notification.to, subject, html }),
        // SEC: sem sinal, `fetch` espera para sempre. Ver `OUTBOUND_TIMEOUT_MS`.
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`Resend respondeu ${res.status}`);
      }
    },
  };
}

function render(n: BookingNotification): { subject: string; html: string } {
  const name = escapeHtml(n.customerName);
  const group = escapeHtml(n.groupName);
  const dates = `${escapeHtml(n.startDate)} a ${escapeHtml(n.endDate)}`;
  if (n.kind === 'received') {
    return {
      subject: `Inscrição recebida — ${n.groupName}`,
      html:
        `<p>Olá, ${name}!</p>` +
        `<p>Recebemos sua inscrição para <strong>${group}</strong> (${dates}).</p>` +
        `<p>Em breve enviaremos as instruções de pagamento. Sua vaga se confirma com o primeiro recebimento.</p>`,
    };
  }
  return {
    subject: `Inscrição confirmada — ${n.groupName}`,
    html:
      `<p>Olá, ${name}!</p>` +
      `<p>Sua inscrição para <strong>${group}</strong> (${dates}) está <strong>confirmada</strong>. Boa expedição!</p>`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

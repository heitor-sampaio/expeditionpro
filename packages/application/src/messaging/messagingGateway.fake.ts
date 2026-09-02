import type { MessagingGateway, OutboundText, SendOutcome } from './messagingGateway.js';

/** Fake do provedor de mensagem (§5.17). Fora do build. */
export function fakeMessagingGateway(): MessagingGateway & {
  enviadas: { to: string; text: string; instancia: string }[];
  falharCom(detalhe: string): void;
} {
  const enviadas: { to: string; text: string; instancia: string }[] = [];
  let falha: string | null = null;
  let seq = 0;

  return {
    enviadas,

    falharCom(detalhe: string) {
      falha = detalhe;
    },

    sendText(message: OutboundText): Promise<SendOutcome> {
      if (falha !== null) return Promise.resolve({ ok: false, detail: falha });
      enviadas.push({
        to: message.to,
        text: message.text,
        instancia: message.integration.externalAccountId,
      });
      seq += 1;
      return Promise.resolve({ ok: true, externalId: `EVO-${seq}` });
    },
  };
}

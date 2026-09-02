import { OUTBOUND_TIMEOUT_MS } from '../outbound.js';
import type { MessagingGateway, OutboundText, SendOutcome } from '@expedition/application';

/**
 * AT-08 — a Evolution de verdade, por HTTP. Único lugar do sistema que conhece o formato da
 * API deles; tudo acima fala o vocabulário daqui.
 *
 * Duas coisas que a API deles impõe e ficam contidas aqui:
 *
 * - **O endereço é do tenant.** Diferente do ASAAS, não há host fixo: cada instalação hospeda
 *   a sua instância, e o endereço vem da conexão do canal.
 * - **A chave vai no cabeçalho `apikey`**, e o nome da instância no caminho.
 *
 * Nada aqui lança. Provedor fora do ar, recusa e resposta em formato inesperado voltam como
 * recusa **com o motivo** — é o que permite a tela dizer o que fazer em vez de "não deu".
 */
export function evolutionGateway(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = OUTBOUND_TIMEOUT_MS,
): MessagingGateway {
  return {
    async sendText(message: OutboundText): Promise<SendOutcome> {
      const base = message.integration.baseUrl.replace(/\/+$/, '');
      const url = `${base}/message/sendText/${encodeURIComponent(
        message.integration.externalAccountId,
      )}`;

      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            apikey: message.integration.accessToken,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ number: message.to, text: message.text }),
          // SEC: sem sinal, `fetch` espera para sempre. Ver `OUTBOUND_TIMEOUT_MS`.
          signal: AbortSignal.timeout(timeoutMs),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) return { ok: false, detail: motivo(response.status, body) };

        const externalId = idDaMensagem(body);
        if (externalId === null) {
          /*
           * 200 sem id de mensagem é sinal de versão diferente da esperada. Guardar assim
           * quebraria a idempotência do eco (AT-03): o webhook traria a mesma mensagem de
           * volta e ela apareceria duas vezes no fio.
           */
          return {
            ok: false,
            detail: `A instância respondeu ${response.status} sem id de mensagem. Confira a versão da Evolution.`,
          };
        }
        return { ok: true, externalId };
      } catch (erroDeRede) {
        // Instância fora do ar, DNS que não resolve, prazo estourado: tudo isso é recusa com
        // motivo, não exceção subindo. Quem chamou precisa mostrar algo a quem está esperando.
        return { ok: false, detail: mensagemDoErro(erroDeRede) };
      }
    },
  };
}

/** `{ key: { id } }` é onde a Evolution devolve o id da mensagem enviada. */
function idDaMensagem(body: unknown): string | null {
  const key = (body as { key?: { id?: unknown } } | null)?.key;
  return typeof key?.id === 'string' && key.id !== '' ? key.id : null;
}

function motivo(status: number, body: unknown): string {
  const texto = (body as { message?: unknown; error?: unknown } | null) ?? {};
  const detalhe = [texto.message, texto.error].find((parte) => typeof parte === 'string');
  return detalhe === undefined ? `A instância respondeu ${status}.` : `${detalhe} (${status})`;
}

function mensagemDoErro(erro: unknown): string {
  return erro instanceof Error
    ? `Não foi possível falar com a instância: ${erro.message}`
    : 'Não foi possível falar com a instância.';
}

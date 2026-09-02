import { OUTBOUND_TIMEOUT_MS } from '../outbound.js';
import type {
  MessagingGateway,
  OutboundMedia,
  OutboundText,
  SendOutcome,
} from '@expedition/application';

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
  /**
   * Uma chamada só para os três endpoints: prazo, cabeçalho e leitura do id são iguais, e o
   * que muda entre mandar texto, foto e voz é o caminho e o corpo.
   */
  async function enviar(
    integration: OutboundText['integration'],
    caminho: string,
    corpo: Record<string, unknown>,
  ): Promise<SendOutcome> {
    const base = integration.baseUrl.replace(/\/+$/, '');
    const url = `${base}/message/${caminho}/${encodeURIComponent(integration.externalAccountId)}`;

    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          apikey: integration.accessToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify(corpo),
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
  }

  return {
    sendText: (message: OutboundText) =>
      enviar(message.integration, 'sendText', { number: message.to, text: message.text }),

    /*
     * AT-13 — **dois** endpoints, e não um com parâmetro.
     *
     * Áudio no WhatsApp é mensagem de voz: outro tipo de coisa, com outra aparência no
     * aparelho e sem legenda. Mandar voz pelo `sendMedia` chega como anexo de áudio, com
     * cara de arquivo — diferença que quem recebe percebe na hora.
     */
    sendMedia: (message: OutboundMedia) =>
      message.kind === 'audio'
        ? enviar(message.integration, 'sendWhatsAppAudio', {
            number: message.to,
            audio: message.base64,
          })
        : enviar(message.integration, 'sendMedia', {
            number: message.to,
            mediatype: message.kind,
            mimetype: message.mimeType,
            media: message.base64,
            // O WhatsApp mostra o nome do arquivo no balão de documento; sem um, o
            // destinatário vê um anexo anônimo.
            fileName: message.fileName ?? nomePadrao(message.mimeType),
            caption: message.caption,
          }),
  };
}

/** Nome de arquivo quando o remetente não deu um. A extensão sai do tipo declarado. */
function nomePadrao(mimeType: string): string {
  const extensao = mimeType.split('/')[1]?.split(';')[0] ?? 'bin';
  return `arquivo.${extensao}`;
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

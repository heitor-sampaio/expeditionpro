import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import type { Channel } from '../inbox/inboxFormat.js';

/**
 * AT-01 — a conexão do tenant com cada canal de mensagem.
 *
 * A chave nunca volta do servidor: a tela mostra `tokenPreview` só para conferir qual está
 * lá. O segredo do webhook aparece **uma vez**, na resposta da conexão — depois disso o banco
 * só tem o hash. É o mesmo desenho de `usePaymentIntegrations`, e de propósito.
 */

export interface ChannelIntegration {
  channel: Channel;
  provider: 'evolution' | 'meta';
  baseUrl: string;
  externalAccountId: string;
  tokenPreview: string;
  active: boolean;
  connectedAt: string;
}

export type ChannelsState =
  | { status: 'loading' }
  | { status: 'ready'; rows: ChannelIntegration[] }
  | { status: 'error' }
  | { status: 'forbidden' };

export type ChannelResult =
  { ok: true; webhookToken?: string | null } | { ok: false; message: string };

export interface ConnectChannelInput {
  channel: Channel;
  provider: 'evolution' | 'meta';
  baseUrl: string;
  externalAccountId: string;
  accessToken: string;
}

export function useChannelIntegrations() {
  const [state, setState] = useState<ChannelsState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api('/v1/channel-integrations', { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          setState({ status: 'forbidden' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: 'ready', rows: (await res.json()) as ChannelIntegration[] });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const run = useCallback(
    async (caminho: string, init: RequestInit): Promise<ChannelResult> => {
      setBusy(true);
      try {
        const res = await api(caminho, {
          ...init,
          headers: { 'content-type': 'application/json', ...init.headers },
        });
        if (!res.ok) {
          const corpo = (await res.json().catch(() => ({}))) as { error?: string };
          return { ok: false, message: mensagem(corpo.error, res.status) };
        }
        const corpo =
          res.status === 204 ? {} : ((await res.json()) as { webhookToken?: string | null });
        refresh();
        return { ok: true, webhookToken: corpo.webhookToken ?? null };
      } catch {
        return { ok: false, message: 'Falha de conexão.' };
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const connect = useCallback(
    (dados: ConnectChannelInput) =>
      run('/v1/channel-integrations', { method: 'POST', body: JSON.stringify(dados) }),
    [run],
  );

  const disconnect = useCallback(
    (channel: Channel) =>
      run(`/v1/channel-integrations/${encodeURIComponent(channel)}`, { method: 'DELETE' }),
    [run],
  );

  return { state, refresh, busy, connect, disconnect };
}

/** O código de erro do servidor vira frase em português; a tela nunca vê status HTTP. */
function mensagem(codigo: string | undefined, status: number): string {
  if (codigo === 'required_field') return 'Preencha o endereço, a instância e a chave.';
  if (status === 401 || status === 403) return 'Conectar um canal exige owner ou admin.';
  if (status === 404) return 'Este canal não está conectado.';
  return 'Não foi possível concluir.';
}

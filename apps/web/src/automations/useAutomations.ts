import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import type { AutomationGraph, TriggerType } from '@expedition/domain';

/**
 * §5.18 — a lista de automações e o que se faz com elas.
 *
 * Zero regra aqui: recusar desenho torto, exigir owner para ligar e impedir edição do que está
 * ligado são do servidor, e é lá que estão testados. Este hook carrega, chama e traduz erro
 * para português — o mesmo desenho de `useBoard` e `useInbox`.
 */

export interface Automation {
  id: string;
  name: string;
  description: string | null;
  /** AU-14: `null` enquanto o quadro não tem bloco de gatilho. */
  triggerType: TriggerType | null;
  graph: AutomationGraph;
  enabled: boolean;
  runAsUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AutomationsState =
  | { status: 'loading' }
  | { status: 'ready'; automations: Automation[] }
  | { status: 'error' }
  | { status: 'forbidden' };

export type ActionResult = { ok: true; id?: string } | { ok: false; message: string };

export function useAutomations() {
  const [state, setState] = useState<AutomationsState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api('/v1/automations', { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          setState({ status: 'forbidden' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: 'ready', automations: (await res.json()) as Automation[] });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const chamar = useCallback(
    async (caminho: string, init: RequestInit): Promise<ActionResult> => {
      setBusy(true);
      try {
        const res = await api(caminho, {
          ...init,
          headers: { 'content-type': 'application/json', ...init.headers },
        });
        if (!res.ok) {
          const corpo = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          return { ok: false, message: mensagem(corpo, res.status) };
        }
        refresh();
        // AU-14: quem cria vai direto para o quadro, e para isso precisa do id de volta.
        const criada = (await res.json().catch(() => ({}))) as { id?: string };
        return criada.id === undefined ? { ok: true } : { ok: true, id: criada.id };
      } catch {
        return { ok: false, message: 'Falha de conexão.' };
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const criar = useCallback(
    (dados: { name: string; description?: string }) =>
      chamar('/v1/automations', { method: 'POST', body: JSON.stringify(dados) }),
    [chamar],
  );

  const salvarGrafo = useCallback(
    (id: string, graph: AutomationGraph) =>
      chamar(`/v1/automations/${encodeURIComponent(id)}/graph`, {
        method: 'PUT',
        body: JSON.stringify({ graph }),
      }),
    [chamar],
  );

  const ligar = useCallback(
    (id: string, enabled: boolean, confirmMoneyActions?: boolean) =>
      chamar(`/v1/automations/${encodeURIComponent(id)}/enabled`, {
        method: 'PUT',
        body: JSON.stringify({ enabled, ...(confirmMoneyActions ? { confirmMoneyActions } : {}) }),
      }),
    [chamar],
  );

  /** AU-26 — duplicar. A cópia nasce desligada, e quem duplica cai nela para editar. */
  const duplicar = useCallback(
    (id: string) =>
      chamar(`/v1/automations/${encodeURIComponent(id)}/duplicate`, { method: 'POST' }),
    [chamar],
  );

  const apagar = useCallback(
    (id: string) => chamar(`/v1/automations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    [chamar],
  );

  return { state, busy, refresh, criar, salvarGrafo, ligar, duplicar, apagar };
}

/**
 * O código do servidor vira frase em português. `invalid_graph` é a exceção: o servidor já
 * manda a lista do que está errado, e ela é mais útil que qualquer frase genérica daqui.
 */
function mensagem(corpo: { error?: string; message?: string }, status: number): string {
  if (corpo.error === 'invalid_graph' && corpo.message) return corpo.message;
  if (corpo.error === 'invalid_graph') return 'O desenho não fecha.';
  if (corpo.error === 'automation_enabled')
    return 'Desligue a automação antes: ela está agindo sobre clientes agora.';
  if (corpo.error === 'money_action_confirmation' && corpo.message) return corpo.message;
  if (corpo.error === 'duplicate_automation') return 'Já existe uma automação com esse nome.';
  if (corpo.error === 'required_field') return 'Dê um nome à automação.';
  if (status === 401 || status === 403) return 'Ligar e editar automação é de owner ou admin.';
  if (status === 404) return 'Automação não encontrada.';
  return 'Não foi possível concluir.';
}

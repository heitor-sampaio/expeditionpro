import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * AU-06 — as execuções de uma automação, e o passo a passo de cada uma.
 *
 * É a tela que responde *"por que essa mensagem foi enviada para esse cliente?"*. Por isso ela
 * carrega sob demanda, e não junto do editor: quem está desenhando não precisa do histórico, e
 * quem está investigando não quer esperar o quadro.
 */

export interface RunStep {
  id: string;
  nodeId: string;
  kind: string;
  outcome: string;
  detail: Record<string, unknown>;
  at: string;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  status: 'pending' | 'waiting' | 'done' | 'failed' | 'cancelled';
  currentNodeId: string | null;
  triggerRef: Record<string, unknown>;
  stepsTaken: number;
  attempts: number;
  lastError: string | null;
  wakeAt: string;
  createdAt: string;
  updatedAt: string;
  steps?: RunStep[];
}

export type RunsState =
  | { status: 'loading' }
  | { status: 'ready'; runs: AutomationRun[] }
  | { status: 'error' }
  | { status: 'forbidden' };

export function useAutomationRuns(automationId: string) {
  const [state, setState] = useState<RunsState>({ status: 'loading' });
  const [aberta, setAberta] = useState<AutomationRun | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api(`/v1/automations/${encodeURIComponent(automationId)}/runs`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          setState({ status: 'forbidden' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: 'ready', runs: (await res.json()) as AutomationRun[] });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [automationId, reloadKey]);

  /** O passo a passo vem só quando alguém abre a execução: é o dado grande. */
  const abrir = useCallback(async (runId: string) => {
    const res = await api(`/v1/automation-runs/${encodeURIComponent(runId)}`);
    if (res.ok) setAberta((await res.json()) as AutomationRun);
  }, []);

  return {
    state,
    aberta,
    abrir,
    fechar: useCallback(() => setAberta(null), []),
    refresh: useCallback(() => setReloadKey((k) => k + 1), []),
  };
}

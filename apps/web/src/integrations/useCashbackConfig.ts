import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Config de cashback da empresa (CB-01/CB-02). Lê /v1/cashback/config e grava com PUT.
 * O módulo nasce desligado; ligar aqui é o switch geral do tenant. As invariantes de
 * faixa (percentual 0..100, valor fixo ≥ 0) são do servidor — a tela só edita e envia.
 */

export interface CashbackConfig {
  enabled: boolean;
  mode: 'percent' | 'fixed';
  value: number;
  base: 'paid' | 'contracted';
  releaseDays: number;
  validityMonths: number;
  maxRedemptionPct: number;
}

export type ConfigState =
  { status: 'loading' } | { status: 'ready'; config: CashbackConfig } | { status: 'error' };

export type SaveResult = { ok: true } | { ok: false; message: string };

export function useCashbackConfig() {
  const [state, setState] = useState<ConfigState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api('/v1/cashback/config', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<CashbackConfig>;
      })
      .then((config) => setState({ status: 'ready', config }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const save = useCallback(async (config: CashbackConfig): Promise<SaveResult> => {
    setBusy(true);
    try {
      const res = await api('/v1/cashback/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const msg =
          res.status === 400
            ? 'Valores fora da faixa. Percentual vai de 0 a 100; valor fixo não é negativo.'
            : `Não deu para salvar (${res.status}).`;
        return { ok: false, message: msg };
      }
      setReloadKey((k) => k + 1);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Falha de conexão.' };
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, refresh, save, busy };
}

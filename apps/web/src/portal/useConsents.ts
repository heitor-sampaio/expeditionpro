import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Consentimento de comunicação no portal (§5.9 · DOC-06 · CM-04). Lê o estado por canal
 * e liga/desliga com um clique (opt-out imediato). Nenhuma regra aqui — o servidor é o
 * ledger. Marketing só; execução de contrato não passa por consentimento.
 */

export type Channel = 'email' | 'push';
export interface ConsentState {
  email: boolean;
  push: boolean;
}

export type ConsentsState =
  { status: 'loading' } | { status: 'ready'; consents: ConsentState } | { status: 'error' };

export function useConsents(customerId: string) {
  const [state, setState] = useState<ConsentsState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api(`/v1/customers/${customerId}/consents`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<ConsentState>;
      })
      .then((consents) => setState({ status: 'ready', consents }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [customerId, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const setChannel = useCallback(
    async (channel: Channel, granted: boolean): Promise<{ ok: boolean }> => {
      setBusy(true);
      try {
        const res = await api(`/v1/customers/${customerId}/consents/${channel}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ granted }),
        });
        if (!res.ok) return { ok: false };
        const consents = (await res.json()) as ConsentState;
        setState({ status: 'ready', consents });
        return { ok: true };
      } finally {
        setBusy(false);
      }
    },
    [customerId],
  );

  return { state, refresh, setChannel, busy };
}

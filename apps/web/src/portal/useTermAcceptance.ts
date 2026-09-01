import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Aceite do Termo no portal (§5.13 · DOC-04). Ao entrar, o cliente consulta o próprio
 * status; se precisa (re)aceitar a versão vigente, o portal bloqueia até o aceite. O
 * registro (canal 'portal', IP, user agent) é do servidor — aqui só o gatilho.
 */

export type TermGateState =
  | { status: 'loading' }
  | { status: 'required'; versionNumber: number; contentHtml: string }
  | { status: 'covered' }
  | { status: 'error' };

interface StatusDto {
  mustAccept: boolean;
  versionNumber: number | null;
  contentHtml: string | null;
}

export function useTermAcceptance(customerId: string) {
  const [state, setState] = useState<TermGateState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api(`/v1/customers/${customerId}/term`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const dto = (await res.json()) as StatusDto;
        if (dto.mustAccept && dto.versionNumber !== null) {
          setState({
            status: 'required',
            versionNumber: dto.versionNumber,
            contentHtml: dto.contentHtml ?? '',
          });
        } else {
          setState({ status: 'covered' });
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [customerId, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const accept = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    setBusy(true);
    try {
      const res = await api(`/v1/customers/${customerId}/term/accept`, { method: 'POST' });
      if (!res.ok)
        return { ok: false, message: `Não deu para registrar o aceite (${res.status}).` };
      setReloadKey((k) => k + 1);
      return { ok: true };
    } finally {
      setBusy(false);
    }
  }, [customerId]);

  return { state, refresh, accept, busy };
}

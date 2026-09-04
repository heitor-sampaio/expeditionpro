import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Chaves de API (IN-21 / §3.9). Lista, cria e revoga. O token completo volta **uma
 * única vez** na criação — o hook o entrega ao chamador para exibir no callout; depois
 * só o mascarado existe. Nenhuma regra aqui: escopo e hash ficam no servidor.
 */

export interface ApiKey {
  id: string;
  name: string;
  masked: string;
  scopes: string[];
  lastUsedAt: string | null;
  useCount: number;
  revoked: boolean;
}

export type ApiKeysState =
  { status: 'loading' } | { status: 'ready'; keys: ApiKey[] } | { status: 'error' };

export type CreateResult =
  { ok: true; token: string; key: ApiKey } | { ok: false; message: string };

export function useApiKeys() {
  const [state, setState] = useState<ApiKeysState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api('/v1/api-keys', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<ApiKey[]>;
      })
      .then((keys) => setState({ status: 'ready', keys }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  /**
   * AU-21 — o escopo é escolhido na criação: a chave do formulário do site não deveria ganhar,
   * de brinde, o poder de disparar automação.
   */
  const create = useCallback(
    async (name: string, scope = 'intake:write'): Promise<CreateResult> => {
      setBusy(true);
      try {
        const res = await api('/v1/api-keys', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, scopes: [scope] }),
        });
        if (!res.ok) return { ok: false, message: `Não deu para criar a chave (${res.status}).` };
        const body = (await res.json()) as { token: string; key: ApiKey };
        setReloadKey((k) => k + 1);
        return { ok: true, token: body.token, key: body.key };
      } catch {
        return { ok: false, message: 'Falha de conexão.' };
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const revoke = useCallback(async (id: string): Promise<{ ok: boolean }> => {
    setBusy(true);
    try {
      const res = await api(`/v1/api-keys/${id}`, { method: 'DELETE' });
      if (res.ok) setReloadKey((k) => k + 1);
      return { ok: res.ok };
    } catch {
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, refresh, create, revoke, busy };
}

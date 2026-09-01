import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Índice de fornecedores (FO-01). Lê /v1/suppliers e cadastra novos. Sem regra aqui:
 * dedup por documento e validações ficam no servidor; a tela só lista e envia o form.
 */

export interface Supplier {
  id: string;
  name: string;
  doc: string | null;
  docType: 'cpf' | 'cnpj' | null;
  phone: string | null;
  email: string | null;
  categoryId: string | null;
  pixKey: string | null;
  pixKeyType: string | null;
  categoryName: string | null;
}

export interface NewSupplierInput {
  name: string;
  doc?: string;
  docType?: 'cpf' | 'cnpj';
  phone?: string;
  email?: string;
  notes?: string;
  categoryId?: string;
  pixKey?: string | null;
}

export type SuppliersState =
  { status: 'loading' } | { status: 'ready'; suppliers: Supplier[] } | { status: 'error' };

export type ActionResult = { ok: true } | { ok: false; message: string };

export function useSuppliers() {
  const [state, setState] = useState<SuppliersState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api('/v1/suppliers', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<Supplier[]>;
      })
      .then((suppliers) => setState({ status: 'ready', suppliers }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const create = useCallback(async (input: NewSupplierInput): Promise<ActionResult> => {
    setBusy(true);
    try {
      const res = await api('/v1/suppliers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) return { ok: false, message: `Não deu para cadastrar (${res.status}).` };
      setReloadKey((k) => k + 1);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Falha de conexão.' };
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, refresh, create, busy };
}

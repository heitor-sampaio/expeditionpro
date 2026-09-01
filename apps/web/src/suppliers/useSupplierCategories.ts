import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Categorias de fornecedor (FO-04/FO-05). Alimenta o seletor do cadastro, a seção de
 * gerência e o relatório de gastos por categoria.
 *
 * O estado tem quatro casos, e não uma lista vazia para tudo: antes, falha de rede e
 * "nenhuma categoria ainda" chegavam iguais na tela, e o operador via "cadastre a
 * primeira" quando na verdade o servidor tinha caído.
 */

export interface SupplierCategory {
  id: string;
  name: string;
}

export type CategoriesState =
  | { status: 'loading' }
  | { status: 'ready'; rows: SupplierCategory[] }
  | { status: 'error' }
  | { status: 'forbidden' };

export type CategoryResult = { ok: true } | { ok: false; message: string };

export function useSupplierCategories() {
  const [state, setState] = useState<CategoriesState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api('/v1/supplier-categories', { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          setState({ status: 'forbidden' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: 'ready', rows: (await res.json()) as SupplierCategory[] });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  /** Cria (ou reusa) uma categoria pelo nome e devolve o registro, atualizando a lista. */
  const createCategory = useCallback(async (name: string): Promise<SupplierCategory | null> => {
    const res = await api('/v1/supplier-categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    const created = (await res.json()) as SupplierCategory;
    setReloadKey((k) => k + 1);
    return created;
  }, []);

  const send = useCallback(
    async (url: string, method: 'PATCH' | 'DELETE', body?: unknown): Promise<CategoryResult> => {
      setBusy(true);
      try {
        const res = await api(url, {
          method,
          ...(body === undefined
            ? {}
            : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        });
        if (!res.ok) {
          const parsed = (await res.json().catch(() => ({}))) as { error?: string };
          return { ok: false, message: messageFor(parsed.error, res.status) };
        }
        setReloadKey((k) => k + 1);
        return { ok: true };
      } catch {
        return { ok: false, message: 'Falha de conexão.' };
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const rename = useCallback(
    (id: string, name: string) => send(`/v1/supplier-categories/${id}`, 'PATCH', { name }),
    [send],
  );
  const remove = useCallback(
    (id: string) => send(`/v1/supplier-categories/${id}`, 'DELETE'),
    [send],
  );

  const categories = state.status === 'ready' ? state.rows : [];
  return { state, categories, busy, refresh, createCategory, rename, remove };
}

/** Código estável do servidor → frase da tela, como o resto do sistema faz. */
function messageFor(code: string | undefined, status: number): string {
  const map: Record<string, string> = {
    category_in_use:
      'Há fornecedores usando esta categoria. Troque a categoria deles antes de excluir.',
    category_name_taken: 'Já existe uma categoria com esse nome.',
  };
  if (code && map[code]) return map[code];
  if (status === 401 || status === 403) return 'Renomear e excluir exige owner ou admin.';
  if (status === 404) return 'Esta categoria não existe mais.';
  return 'Não foi possível concluir. Tente de novo.';
}

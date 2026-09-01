import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { api } from '../auth/api.js';
import { companyStore, type Company } from './companyStore.js';

/**
 * CF-01 — lê e grava a identidade da empresa. O resultado vai para o store, então salvar
 * na aba Empresa atualiza a marca da navegação no mesmo instante.
 */

export type CompanyState =
  | { status: 'loading' }
  | { status: 'ready'; company: Company }
  | { status: 'error' }
  | { status: 'forbidden' };

export type SaveResult = { ok: true } | { ok: false; message: string };

export interface CompanyDraft {
  name?: string;
  cnpj?: string | null;
  logo?: string | null;
}

/** Só leitura, para quem apenas exibe a marca (a navegação). */
export function useCompanyValue(): Company | null {
  return useSyncExternalStore(
    (listener) => companyStore.subscribe(listener),
    () => companyStore.snapshot(),
    () => null,
  );
}

export function useCompany() {
  const [state, setState] = useState<CompanyState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api('/v1/company', { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          setState({ status: 'forbidden' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const company = (await res.json()) as Company;
        companyStore.set(company);
        setState({ status: 'ready', company });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  const save = useCallback(async (draft: CompanyDraft): Promise<SaveResult> => {
    setBusy(true);
    try {
      const res = await api('/v1/company', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const parsed = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, message: messageFor(parsed.error, res.status) };
      }
      const company = (await res.json()) as Company;
      companyStore.set(company);
      setState({ status: 'ready', company });
      return { ok: true };
    } catch {
      return { ok: false, message: 'Falha de conexão.' };
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, refresh, save };
}

function messageFor(code: string | undefined, status: number): string {
  const map: Record<string, string> = {
    invalid_cnpj: 'CNPJ inválido. Confira os dígitos.',
    invalid_logo: 'A logo precisa ser PNG ou JPG, e caber no tamanho máximo.',
    required_field: 'Preencha os campos obrigatórios.',
    validation_failed: 'Confira os dados antes de salvar.',
  };
  if (code && map[code]) return map[code];
  if (status === 401 || status === 403) return 'Editar a empresa exige owner ou admin.';
  return 'Não foi possível salvar. Tente de novo.';
}

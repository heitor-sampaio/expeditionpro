import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Ficha do fornecedor (FO-03). Lê /v1/suppliers/:id/file — dados fiscais, as saídas em
 * que prestou serviço (contratado/pago/em aberto por grupo, já derivados no servidor) e
 * o extrato de pagamentos. Sem cálculo aqui: a tela só renderiza.
 */

export interface FileSupplier {
  id: string;
  name: string;
  doc: string | null;
  docType: 'cpf' | 'cnpj' | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  categoryId: string | null;
  pixKey: string | null;
  pixKeyType: string | null;
  categoryName: string | null;
}

/** Patch de edição do fornecedor (FO-04). `null` limpa; ausência preserva. */
export interface SupplierPatchInput {
  name: string;
  doc?: string | null;
  docType?: 'cpf' | 'cnpj';
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  categoryId?: string | null;
  pixKey?: string | null;
}

export interface FileSaida {
  groupId: string;
  groupName: string;
  startDate: string;
  endDate: string;
  contractedCents: number;
  paidCents: number;
  outstandingCents: number;
}

export interface FileSupplierPayment {
  id: string;
  paidAt: string;
  amountCents: number;
  method: string;
  expenseDescription: string;
  groupName: string;
}

export interface SupplierFileView {
  supplier: FileSupplier;
  saidas: FileSaida[];
  pagamentos: FileSupplierPayment[];
  totals: { contractedCents: number; paidCents: number; outstandingCents: number };
}

export type SupplierFileState =
  { status: 'loading' } | { status: 'ready'; file: SupplierFileView } | { status: 'error' };

export function useSupplierFile(supplierId: string) {
  const [state, setState] = useState<SupplierFileState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api(`/v1/suppliers/${supplierId}/file`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<SupplierFileView>;
      })
      .then((file) => setState({ status: 'ready', file }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [supplierId, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const update = useCallback(
    async (patch: SupplierPatchInput): Promise<{ ok: true } | { ok: false; message: string }> => {
      const res = await api(`/v1/suppliers/${supplierId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setReloadKey((k) => k + 1);
        return { ok: true };
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (body.error === 'duplicate_supplier') {
        return { ok: false, message: 'Já existe fornecedor com esse documento.' };
      }
      return { ok: false, message: `Não deu para salvar (${res.status}).` };
    },
    [supplierId],
  );

  return { state, refresh, update };
}

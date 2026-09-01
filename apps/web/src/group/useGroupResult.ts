import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Resultado financeiro do grupo (GR-08/09/10). Lê o resultado agregado e a lista de
 * despesas (com pago/em aberto derivados), permite lançar gasto e pagar fornecedor.
 * Nada é calculado aqui: receita, margem e saldos vêm do servidor.
 */

export interface GroupResult {
  revenueContractedCents: number;
  receivedCents: number;
  expenseTotalCents: number;
  paidToSuppliersCents: number;
  grossMarginCents: number;
  marginPercent: number | null;
  supplierOutstandingCents: number;
}

export interface GroupExpense {
  id: string;
  supplierId: string;
  supplierName: string;
  description: string;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
}

export interface SupplierOption {
  id: string;
  name: string;
}

export type ResultState =
  | { status: 'loading' }
  | { status: 'ready'; result: GroupResult; expenses: GroupExpense[]; suppliers: SupplierOption[] }
  | { status: 'error' };

export type ActionResult = { ok: true } | { ok: false; message: string };

export interface NewExpenseInput {
  supplierId: string;
  description: string;
  totalCents: number;
}

export interface SupplierPaymentInput {
  amountCents: number;
  method: 'pix' | 'boleto' | 'card' | 'cash';
  paidAt: string;
}

export function useGroupResult(groupId: string) {
  const [state, setState] = useState<ResultState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    Promise.all([
      api(`/v1/groups/${groupId}/result`, { signal: controller.signal }),
      api(`/v1/groups/${groupId}/expenses`, { signal: controller.signal }),
      api('/v1/suppliers', { signal: controller.signal }),
    ])
      .then(async ([resultRes, expensesRes, suppliersRes]) => {
        if (!resultRes.ok || !expensesRes.ok || !suppliersRes.ok) throw new Error('load');
        const result = (await resultRes.json()) as GroupResult;
        const expenses = (await expensesRes.json()) as GroupExpense[];
        const suppliers = (await suppliersRes.json()) as SupplierOption[];
        setState({ status: 'ready', result, expenses, suppliers });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [groupId, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const post = useCallback(async (url: string, body: unknown): Promise<ActionResult> => {
    setBusy(true);
    try {
      const res = await api(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return { ok: false, message: `Não deu certo (${res.status}).` };
      setReloadKey((k) => k + 1);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Falha de conexão.' };
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * Como o `post`, mas para os métodos sem corpo. O `post` já traduzia falha em frase; aqui
   * o motivo vem em código estável do servidor, porque "gasto com pagamento" precisa dizer
   * o que fazer, e não só "não deu certo".
   */
  const send = useCallback(async (url: string, method: 'DELETE'): Promise<ActionResult> => {
    setBusy(true);
    try {
      const res = await api(url, { method });
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
  }, []);

  const addExpense = useCallback(
    (input: NewExpenseInput) => post(`/v1/groups/${groupId}/expenses`, input),
    [groupId, post],
  );
  const payExpense = useCallback(
    (expenseId: string, input: SupplierPaymentInput) =>
      post(`/v1/expenses/${expenseId}/payments`, input),
    [post],
  );

  /** GR-18: exclusão lógica no servidor; aqui só some da tabela e os totais re-derivam. */
  const deleteExpense = useCallback(
    (expenseId: string) => send(`/v1/expenses/${expenseId}`, 'DELETE'),
    [send],
  );

  return { state, refresh, addExpense, payExpense, deleteExpense, busy };
}

/** Código estável do servidor → frase da tela. */
function messageFor(code: string | undefined, status: number): string {
  if (code === 'expense_has_payments') {
    return 'Este gasto já tem pagamento lançado. Acerte com o fornecedor em vez de excluir.';
  }
  if (status === 401 || status === 403) return 'Excluir gasto exige owner ou admin.';
  if (status === 404) return 'Este gasto não existe mais.';
  return 'Não foi possível excluir. Tente de novo.';
}

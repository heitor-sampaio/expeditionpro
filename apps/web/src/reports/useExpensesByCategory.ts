import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import type { ReportFilter } from './useFinancialReport.js';

/**
 * FO-06 — gastos por categoria de fornecedor. Mesmo filtro do fechamento por saída, e de
 * propósito: os dois somam o mesmo total de gastos, e é isso que permite lê-los na mesma
 * página sem desconfiar de nenhum dos dois.
 *
 * Nenhuma regra aqui — tudo derivado no servidor.
 */

export interface ExpenseCategoryRow {
  /** `null` = fornecedor sem categoria (ou fora do cadastro). */
  categoryId: string | null;
  categoryName: string;
  contractedCents: number;
  paidCents: number;
  outstandingCents: number;
  supplierCount: number;
  expenseCount: number;
}

export interface ExpenseCategoryTotals {
  contractedCents: number;
  paidCents: number;
  outstandingCents: number;
  expenseCount: number;
}

export interface ExpensesByCategory {
  rows: ExpenseCategoryRow[];
  totals: ExpenseCategoryTotals;
}

export type ExpensesByCategoryState =
  { status: 'loading' } | { status: 'ready'; report: ExpensesByCategory } | { status: 'error' };

function queryOf(filter: ReportFilter): string {
  const params = new URLSearchParams();
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.itineraryId) params.set('itineraryId', filter.itineraryId);
  const q = params.toString();
  return q ? `?${q}` : '';
}

export function useExpensesByCategory(filter: ReportFilter) {
  const [state, setState] = useState<ExpensesByCategoryState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const query = queryOf(filter);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api(`/v1/reports/expenses-by-category${query}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<ExpensesByCategory>;
      })
      .then((report) => setState({ status: 'ready', report }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey, query]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  return { state, refresh };
}

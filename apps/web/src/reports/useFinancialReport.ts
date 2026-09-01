import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Fechamento por saída, consolidado (estende GR-10). Uma linha por saída + totais do
 * tenant. Nenhuma regra aqui — tudo derivado no servidor. Só a equipe (dado financeiro).
 */

export interface ReportRow {
  groupId: string;
  groupName: string;
  startDate: string;
  endDate: string;
  status: string;
  revenueCents: number;
  expenseCents: number;
  grossMarginCents: number;
  marginPercent: number | null;
  receivedCents: number;
  dueCents: number;
}

export interface ReportTotals {
  revenueCents: number;
  expenseCents: number;
  grossMarginCents: number;
  marginPercent: number | null;
  receivedCents: number;
  dueCents: number;
}

export interface FinancialReport {
  rows: ReportRow[];
  totals: ReportTotals;
}

export type ReportState =
  { status: 'loading' } | { status: 'ready'; report: FinancialReport } | { status: 'error' };

export interface ReportFilter {
  from?: string;
  to?: string;
  itineraryId?: string;
}

function queryOf(filter: ReportFilter): string {
  const params = new URLSearchParams();
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.itineraryId) params.set('itineraryId', filter.itineraryId);
  const q = params.toString();
  return q ? `?${q}` : '';
}

export function useFinancialReport(filter: ReportFilter) {
  const [state, setState] = useState<ReportState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const query = queryOf(filter);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api(`/v1/reports/financial${query}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<FinancialReport>;
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

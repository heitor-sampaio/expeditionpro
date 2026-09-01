import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import { useLiveRefresh } from '../live/useLiveRefresh.js';

/**
 * Ficha do cliente (CL-06). O hook lê /v1/customers/:id/file — dados do cliente,
 * as expedições em que participou (com contratado/recebido/a receber já derivados
 * no servidor) e o extrato de cashback. Nenhum cálculo aqui: a tela só renderiza.
 */

export interface FileCustomer {
  id: string;
  fullName: string;
  cpf: string;
  birthDate: string;
  email: string | null;
  phone: string | null;
  role: 'responsible' | 'companion';
}

export interface FileExpedition {
  bookingId: string;
  groupId: string;
  groupName: string;
  startDate: string;
  endDate: string;
  status: string;
  role: 'responsible' | 'companion';
  participantCount: number;
  contractedCents: number;
  receivedCents: number;
  dueCents: number;
}

export interface FileCashbackEntry {
  id: string;
  bookingId: string;
  type: string;
  amountCents: number;
  availableFrom: string | null;
  expiresAt: string | null;
}

/** Membro da família na ficha: só id e nome — o que as ações de vínculo precisam (CL-10). */
export interface FileMember {
  id: string;
  fullName: string;
}

export interface FileFamily {
  responsible: FileMember | null;
  companions: FileMember[];
}

export interface CustomerFileView {
  customer: FileCustomer;
  family: FileFamily;
  expeditions: FileExpedition[];
  cashback: { balanceCents: number; entries: FileCashbackEntry[] };
}

export type FileState =
  { status: 'loading' } | { status: 'ready'; file: CustomerFileView } | { status: 'error' };

export function useCustomerFile(customerId: string) {
  const [state, setState] = useState<FileState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api(`/v1/customers/${customerId}/file`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<CustomerFileView>;
      })
      .then((file) => setState({ status: 'ready', file }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [customerId, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // Ao vivo: a equipe confirma a inscrição ou lança um recebimento e o cliente vê mudar.
  // A RLS entrega ao cliente só o que é da família dele.
  useLiveRefresh(
    `customer-file-${customerId}`,
    [{ table: 'bookings' }, { table: 'booking_payments' }, { table: 'cashback_entries' }],
    refresh,
  );

  return { state, refresh };
}

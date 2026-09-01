import { useCallback, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Contrato aceito de uma inscrição (§5.13 · DOC-08), buscado **sob demanda** — o texto
 * preenchido é reconstruído no servidor a partir do snapshot, sem PDF guardado. `404`
 * significa que aquela inscrição não tem aceite registrado (estado "none").
 */

export interface AcceptedTerm {
  versionNumber: number;
  contentHtml: string;
  acceptedAt: string;
}

export type AcceptedTermState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; term: AcceptedTerm }
  | { status: 'none' }
  | { status: 'error' };

export function useAcceptedTerm(bookingId: string) {
  const [state, setState] = useState<AcceptedTermState>({ status: 'idle' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const res = await api(`/v1/bookings/${bookingId}/term-document`);
      if (res.status === 404) {
        setState({ status: 'none' });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const term = (await res.json()) as AcceptedTerm;
      setState({ status: 'ready', term });
    } catch {
      setState({ status: 'error' });
    }
  }, [bookingId]);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, load, reset };
}

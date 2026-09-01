import { useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Tabela de preços vigente **hoje** para um roteiro (§3.4/RO-03). É leitura de vitrine: a
 * inscrição congela o valor vigente na **data de início da saída**, que pode ser outro —
 * por isso a tela avisa que o valor é o de hoje.
 *
 * Sem versão vigente (roteiro sem preço na data), a API responde 404 e o estado vira
 * `none`: a página mostra "sob consulta" em vez de um valor inventado.
 */

export interface PriceTableDto {
  coupleCents: number;
  soloCents: number;
  extraAdultCents: number;
  childMidCents: number;
  childYoungCents: number;
}

export type PricesState =
  { status: 'loading' } | { status: 'ready'; prices: PriceTableDto } | { status: 'none' };

export function useItineraryPrices(itineraryId: string): PricesState {
  const [state, setState] = useState<PricesState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const at = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    api(`/v1/itineraries/${itineraryId}/prices?at=${at}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          setState({ status: 'none' });
          return;
        }
        setState({ status: 'ready', prices: (await res.json()) as PriceTableDto });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'none' });
        }
      });
    return () => controller.abort();
  }, [itineraryId]);

  return state;
}

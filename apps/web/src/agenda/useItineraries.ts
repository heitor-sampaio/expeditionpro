import { useEffect, useState } from 'react';
import { api } from '../auth/api.js';

export interface ItineraryDto {
  id: string;
  name: string;
  slug: string;
  kind: string;
}

export type ItinerariesState =
  { status: 'loading' } | { status: 'ready'; itineraries: ItineraryDto[] } | { status: 'error' };

/** Lista os roteiros do tenant — alimenta o seletor de "novo evento". */
export function useItineraries(enabled: boolean) {
  const [state, setState] = useState<ItinerariesState>({ status: 'loading' });

  useEffect(() => {
    if (!enabled) return;
    setState({ status: 'loading' });
    const controller = new AbortController();
    api('/v1/itineraries', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<ItineraryDto[]>;
      })
      .then((itineraries) => setState({ status: 'ready', itineraries }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [enabled]);

  return state;
}

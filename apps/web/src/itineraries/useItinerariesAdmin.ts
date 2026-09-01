import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Roteiros (RO-01..03): lista, cria (com faixas etárias + primeiro preço) e versiona o
 * preço (reajuste com `valid_from`). Toda a regra — snapshot, versão vigente por data —
 * vive no servidor; o hook só orquestra leitura e escrita.
 */

export interface ItineraryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  difficulty: string | null;
  status: string;
  kind: string;
  childYoungMaxAge: number;
  childMidMaxAge: number;
  coverPath: string | null;
}

export type ItinerariesState =
  { status: 'loading' } | { status: 'ready'; itineraries: ItineraryDto[] } | { status: 'error' };

export interface PriceInput {
  validFrom: string;
  coupleCents: number;
  soloCents: number;
  extraAdultCents: number;
  childMidCents: number;
  childYoungCents: number;
}

export interface NewItineraryInput {
  name: string;
  description?: string;
  difficulty?: string;
  childYoungMaxAge?: number;
  childMidMaxAge?: number;
  prices: PriceInput;
}

export interface UpdateItineraryInput {
  name?: string;
  description?: string;
  difficulty?: string;
  status?: string;
  childYoungMaxAge?: number;
  childMidMaxAge?: number;
}

export interface ItineraryPhotoDto {
  id: string;
  storagePath: string;
  alt: string | null;
  position: number;
  isCover: boolean;
}

export interface ItineraryPhotoSave {
  storagePath: string;
  alt?: string | null;
  isCover?: boolean;
}

export interface PriceVersionDto {
  id: string;
  validFrom: string; // YYYY-MM-DD
  coupleCents: number;
  soloCents: number;
  extraAdultCents: number;
  childMidCents: number;
  childYoungCents: number;
}

type Result = { ok: true } | { ok: false; message: string };

export function useItinerariesAdmin() {
  const [state, setState] = useState<ItinerariesState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
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
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const createItinerary = useCallback(
    async (input: NewItineraryInput): Promise<Result> => {
      const res = await api('/v1/itineraries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        refresh();
        return { ok: true };
      }
      return { ok: false, message: messageFor(res.status) };
    },
    [refresh],
  );

  const updateItinerary = useCallback(
    async (id: string, input: UpdateItineraryInput): Promise<Result> => {
      const res = await api(`/v1/itineraries/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        refresh();
        return { ok: true };
      }
      return { ok: false, message: messageFor(res.status) };
    },
    [refresh],
  );

  const loadPhotos = useCallback(async (id: string): Promise<ItineraryPhotoDto[]> => {
    const res = await api(`/v1/itineraries/${id}/photos`);
    if (!res.ok) return [];
    return (await res.json()) as ItineraryPhotoDto[];
  }, []);

  const savePhotos = useCallback(
    async (id: string, photos: ItineraryPhotoSave[]): Promise<Result> => {
      const res = await api(`/v1/itineraries/${id}/photos`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photos }),
      });
      if (res.ok) return { ok: true };
      return { ok: false, message: messageFor(res.status) };
    },
    [],
  );

  const loadPriceVersions = useCallback(async (id: string): Promise<PriceVersionDto[]> => {
    const res = await api(`/v1/itineraries/${id}/price-versions`);
    if (!res.ok) return [];
    return (await res.json()) as PriceVersionDto[];
  }, []);

  const addPrice = useCallback(async (itineraryId: string, prices: PriceInput): Promise<Result> => {
    const res = await api(`/v1/itineraries/${itineraryId}/prices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(prices),
    });
    if (res.ok) return { ok: true };
    return { ok: false, message: messageFor(res.status) };
  }, []);

  return {
    state,
    refresh,
    createItinerary,
    updateItinerary,
    loadPhotos,
    savePhotos,
    loadPriceVersions,
    addPrice,
  };
}

function messageFor(status: number): string {
  if (status === 400 || status === 422) return 'Confira os campos antes de salvar.';
  if (status === 409) return 'Já existe um roteiro com esse nome.';
  return 'Não foi possível salvar. Tente de novo.';
}

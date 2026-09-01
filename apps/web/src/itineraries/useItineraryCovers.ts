import { useItinerariesAdmin } from './useItinerariesAdmin.js';

/**
 * Capa por roteiro, para as telas que listam **saídas** (a vitrine fala de datas, não de
 * fotos). Cruza o catálogo já carregado; sem capa — ou catálogo ainda carregando — devolve
 * `null`, e a capa cai no marcador neutro.
 */
export function useItineraryCovers(): (itineraryId: string) => string | null {
  const { state } = useItinerariesAdmin();
  return (itineraryId: string) =>
    state.status === 'ready'
      ? (state.itineraries.find((i) => i.id === itineraryId)?.coverPath ?? null)
      : null;
}

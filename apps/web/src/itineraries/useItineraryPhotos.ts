import { useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/** Fotos do roteiro (RO-01/RO-04), na ordem cadastrada — a capa vem primeiro. */
export interface ItineraryPhotoDto {
  id: string;
  storagePath: string;
  alt: string | null;
  position: number;
  isCover: boolean;
}

export function useItineraryPhotos(itineraryId: string): ItineraryPhotoDto[] | null {
  const [photos, setPhotos] = useState<ItineraryPhotoDto[] | null>(null);

  useEffect(() => {
    setPhotos(null);
    const controller = new AbortController();
    api(`/v1/itineraries/${itineraryId}/photos`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const rows = (await res.json()) as ItineraryPhotoDto[];
        // Capa primeiro; o resto na posição cadastrada.
        setPhotos(
          [...rows].sort(
            (a, b) => Number(b.isCover) - Number(a.isCover) || a.position - b.position,
          ),
        );
      })
      .catch((error: unknown) => {
        // Sem foto a tela ainda funciona: a galeria simplesmente não aparece.
        if (!(error instanceof DOMException && error.name === 'AbortError')) setPhotos([]);
      });
    return () => controller.abort();
  }, [itineraryId]);

  return photos;
}

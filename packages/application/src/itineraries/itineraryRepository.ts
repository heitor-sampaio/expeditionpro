import type { LocalDate, PriceTable } from '@expedition/domain';

/**
 * Port de roteiros e seus preços versionados (§3.4 / RO). O preço é criado junto
 * do roteiro (atômico na infra) e ganha versões novas por valid_from.
 */

export interface NewItinerary {
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly difficulty: string | null;
  readonly status: string;
  readonly kind: string; // catalog | custom
  readonly childYoungMaxAge: number;
  readonly childMidMaxAge: number;
}

export interface ItineraryRecord extends NewItinerary {
  readonly id: string;
  /** Path da foto de capa (RO-01), quando houver. Preenchido na listagem. */
  readonly coverStoragePath: string | null;
}

/** Foto da galeria do roteiro (RO-01). Storage por tenant; guarda só o path. */
export interface NewItineraryPhoto {
  readonly storagePath: string;
  readonly alt: string | null;
  readonly isCover: boolean;
}

export interface ItineraryPhotoRecord extends NewItineraryPhoto {
  readonly id: string;
  readonly position: number;
}

export interface NewPriceVersion {
  readonly validFrom: LocalDate;
  readonly prices: PriceTable;
}

export interface PriceVersionRecord extends NewPriceVersion {
  readonly id: string;
}

/** Campos editáveis de um roteiro (RO-02) — tudo menos id/tenant/kind. */
export interface ItineraryPatch {
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly difficulty: string | null;
  readonly status: string;
  readonly childYoungMaxAge: number;
  readonly childMidMaxAge: number;
}

export interface ItineraryRepository {
  create(itinerary: NewItinerary, initialPrice: NewPriceVersion): Promise<ItineraryRecord>;
  findById(tenantId: string, id: string): Promise<ItineraryRecord | null>;
  list(tenantId: string): Promise<ItineraryRecord[]>;
  update(tenantId: string, id: string, patch: ItineraryPatch): Promise<ItineraryRecord>;
  addPriceVersion(tenantId: string, itineraryId: string, version: NewPriceVersion): Promise<void>;
  listPrices(tenantId: string, itineraryId: string): Promise<PriceVersionRecord[]>;
  listPhotos(tenantId: string, itineraryId: string): Promise<ItineraryPhotoRecord[]>;
  setPhotos(
    tenantId: string,
    itineraryId: string,
    photos: readonly NewItineraryPhoto[],
  ): Promise<ItineraryPhotoRecord[]>;
}

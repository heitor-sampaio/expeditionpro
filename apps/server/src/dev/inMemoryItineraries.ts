import type {
  ItineraryPatch,
  ItineraryPhotoRecord,
  ItineraryRecord,
  ItineraryRepository,
  NewItinerary,
  NewItineraryPhoto,
  NewPriceVersion,
  PriceVersionRecord,
} from '@expedition/application';

/** Roteiros em memória — SÓ para dev sem banco e testes de rota. */
export function inMemoryItineraries(): ItineraryRepository {
  const itineraries: ItineraryRecord[] = [];
  const prices: (PriceVersionRecord & { itineraryId: string })[] = [];
  const photos = new Map<string, ItineraryPhotoRecord[]>();
  let seq = 0;

  const withCover = (record: ItineraryRecord | null): ItineraryRecord | null => {
    if (!record) return null;
    const cover = (photos.get(record.id) ?? []).find((p) => p.isCover);
    return { ...record, coverStoragePath: cover?.storagePath ?? null };
  };

  return {
    create(itinerary: NewItinerary, initialPrice: NewPriceVersion) {
      seq += 1;
      const record: ItineraryRecord = {
        ...itinerary,
        id: `dev-itin-${seq}`,
        coverStoragePath: null,
      };
      itineraries.push(record);
      prices.push({ ...initialPrice, id: `dev-price-${seq}`, itineraryId: record.id });
      return Promise.resolve(record);
    },
    findById(tenantId: string, id: string) {
      return Promise.resolve(
        withCover(itineraries.find((i) => i.tenantId === tenantId && i.id === id) ?? null),
      );
    },
    list(tenantId: string) {
      return Promise.resolve(
        itineraries.filter((i) => i.tenantId === tenantId).map((i) => withCover(i)!),
      );
    },
    update(tenantId: string, id: string, patch: ItineraryPatch) {
      const index = itineraries.findIndex((i) => i.tenantId === tenantId && i.id === id);
      const current = itineraries[index];
      if (!current) return Promise.reject(new Error('roteiro inexistente'));
      const next: ItineraryRecord = { ...current, ...patch };
      itineraries[index] = next;
      return Promise.resolve(withCover(next)!);
    },
    addPriceVersion(_tenantId: string, itineraryId: string, version: NewPriceVersion) {
      seq += 1;
      prices.push({ ...version, id: `dev-price-${seq}`, itineraryId });
      return Promise.resolve();
    },
    listPrices(_tenantId: string, itineraryId: string) {
      return Promise.resolve(prices.filter((p) => p.itineraryId === itineraryId));
    },
    listPhotos(_tenantId: string, itineraryId: string) {
      return Promise.resolve(photos.get(itineraryId) ?? []);
    },
    setPhotos(_tenantId: string, itineraryId: string, next: readonly NewItineraryPhoto[]) {
      seq += 1;
      const records: ItineraryPhotoRecord[] = next.map((p, position) => ({
        ...p,
        id: `dev-photo-${seq}-${position}`,
        position,
      }));
      photos.set(itineraryId, records);
      return Promise.resolve(records);
    },
  };
}

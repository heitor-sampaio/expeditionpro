import type {
  ItineraryPatch,
  ItineraryPhotoRecord,
  ItineraryRecord,
  ItineraryRepository,
  NewItinerary,
  NewItineraryPhoto,
  NewPriceVersion,
  PriceVersionRecord,
} from './itineraryRepository.js';

/** Fake in-memory do port de roteiros. Excluído do build (`*.fake.ts`). */
export function fakeItineraryRepository(): ItineraryRepository & {
  itineraries: ItineraryRecord[];
  prices: (PriceVersionRecord & { itineraryId: string })[];
} {
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
    itineraries,
    prices,
    create(itinerary: NewItinerary, initialPrice: NewPriceVersion) {
      seq += 1;
      const record: ItineraryRecord = { ...itinerary, id: `itin-${seq}`, coverStoragePath: null };
      itineraries.push(record);
      prices.push({ ...initialPrice, id: `price-${seq}`, itineraryId: record.id });
      return Promise.resolve(record);
    },
    findById(tenantId: string, id: string) {
      return Promise.resolve(
        withCover(itineraries.find((i) => i.tenantId === tenantId && i.id === id) ?? null),
      );
    },
    update(tenantId: string, id: string, patch: ItineraryPatch) {
      const index = itineraries.findIndex((i) => i.tenantId === tenantId && i.id === id);
      const current = itineraries[index];
      if (!current) return Promise.reject(new Error('roteiro inexistente no fake'));
      const next: ItineraryRecord = { ...current, ...patch };
      itineraries[index] = next;
      return Promise.resolve(withCover(next)!);
    },
    list(tenantId: string) {
      return Promise.resolve(
        itineraries.filter((i) => i.tenantId === tenantId).map((i) => withCover(i)!),
      );
    },
    addPriceVersion(tenantId: string, itineraryId: string, version: NewPriceVersion) {
      seq += 1;
      prices.push({ ...version, id: `price-${seq}`, itineraryId });
      return Promise.resolve();
    },
    listPrices(_tenantId: string, itineraryId: string) {
      return Promise.resolve(prices.filter((p) => p.itineraryId === itineraryId));
    },
    listPhotos(_tenantId: string, itineraryId: string) {
      return Promise.resolve(photos.get(itineraryId) ?? []);
    },
    setPhotos(_tenantId: string, itineraryId: string, next: readonly NewItineraryPhoto[]) {
      const records: ItineraryPhotoRecord[] = next.map((p, position) => {
        seq += 1;
        return { ...p, id: `photo-${seq}`, position };
      });
      photos.set(itineraryId, records);
      return Promise.resolve(records);
    },
  };
}

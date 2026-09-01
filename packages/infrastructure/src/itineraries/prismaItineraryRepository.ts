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
import { cents, type LocalDate } from '@expedition/domain';
import type {
  Itinerary as PrismaItinerary,
  ItineraryPrice as PrismaPrice,
} from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma de roteiros e preços. O `create` é atômico (roteiro + preço
 * inicial num `$transaction`), com tenant_id explícito. Dinheiro: BigInt no banco
 * (§3.6) ↔ Cents (number) no domínio, convertido nas bordas.
 */
// A capa é a foto marcada `is_cover` (RO-01). Incluída como no máximo uma linha.
const coverInclude = { photos: { where: { isCover: true }, take: 1 } } as const;

export function prismaItineraryRepository(base: PrismaClient): ItineraryRepository {
  return {
    async create(itinerary: NewItinerary, initialPrice: NewPriceVersion): Promise<ItineraryRecord> {
      const created = await base.$transaction(async (tx) => {
        const row = await tx.itinerary.create({
          data: {
            tenantId: itinerary.tenantId,
            name: itinerary.name,
            slug: itinerary.slug,
            description: itinerary.description,
            difficulty: itinerary.difficulty,
            status: itinerary.status,
            kind: itinerary.kind,
            childYoungMaxAge: itinerary.childYoungMaxAge,
            childMidMaxAge: itinerary.childMidMaxAge,
          },
        });
        await tx.itineraryPrice.create({
          data: priceData(itinerary.tenantId, row.id, initialPrice),
        });
        return row;
      });
      // Recém-criado não tem fotos ainda.
      return toItineraryRecord(created, null);
    },

    async findById(tenantId: string, id: string): Promise<ItineraryRecord | null> {
      const row = await tenantClient(base, tenantId).itinerary.findUnique({
        where: { id },
        include: coverInclude,
      });
      return row ? toItineraryRecord(row, coverOf(row)) : null;
    },

    async list(tenantId: string): Promise<ItineraryRecord[]> {
      const rows = await tenantClient(base, tenantId).itinerary.findMany({
        orderBy: { name: 'asc' },
        include: coverInclude,
      });
      return rows.map((row) => toItineraryRecord(row, coverOf(row)));
    },

    async update(tenantId: string, id: string, patch: ItineraryPatch): Promise<ItineraryRecord> {
      const row = await tenantClient(base, tenantId).itinerary.update({
        where: { id },
        data: {
          name: patch.name,
          slug: patch.slug,
          description: patch.description,
          difficulty: patch.difficulty,
          status: patch.status,
          childYoungMaxAge: patch.childYoungMaxAge,
          childMidMaxAge: patch.childMidMaxAge,
        },
        include: coverInclude,
      });
      return toItineraryRecord(row, coverOf(row));
    },

    async addPriceVersion(
      tenantId: string,
      itineraryId: string,
      version: NewPriceVersion,
    ): Promise<void> {
      await tenantClient(base, tenantId).itineraryPrice.create({
        data: priceData(tenantId, itineraryId, version),
      });
    },

    async listPrices(tenantId: string, itineraryId: string): Promise<PriceVersionRecord[]> {
      const rows = await tenantClient(base, tenantId).itineraryPrice.findMany({
        where: { itineraryId },
        orderBy: { validFrom: 'asc' },
      });
      return rows.map(toPriceVersionRecord);
    },

    async listPhotos(tenantId: string, itineraryId: string): Promise<ItineraryPhotoRecord[]> {
      const rows = await tenantClient(base, tenantId).itineraryPhoto.findMany({
        where: { itineraryId },
        orderBy: { position: 'asc' },
      });
      return rows.map(toPhotoRecord);
    },

    async setPhotos(
      tenantId: string,
      itineraryId: string,
      photos: readonly NewItineraryPhoto[],
    ): Promise<ItineraryPhotoRecord[]> {
      // Substitui o conjunto inteiro numa transação: apaga o que havia e regrava em ordem.
      const db = tenantClient(base, tenantId);
      await base.$transaction([
        db.itineraryPhoto.deleteMany({ where: { itineraryId } }),
        ...photos.map((photo, position) =>
          db.itineraryPhoto.create({
            data: {
              tenantId,
              itineraryId,
              storagePath: photo.storagePath,
              alt: photo.alt,
              position,
              isCover: photo.isCover,
            },
          }),
        ),
      ]);
      const rows = await db.itineraryPhoto.findMany({
        where: { itineraryId },
        orderBy: { position: 'asc' },
      });
      return rows.map(toPhotoRecord);
    },
  };
}

function toPhotoRecord(row: {
  id: string;
  storagePath: string;
  alt: string | null;
  position: number;
  isCover: boolean;
}): ItineraryPhotoRecord {
  return {
    id: row.id,
    storagePath: row.storagePath,
    alt: row.alt,
    position: row.position,
    isCover: row.isCover,
  };
}

function priceData(tenantId: string, itineraryId: string, version: NewPriceVersion) {
  return {
    tenantId,
    itineraryId,
    validFrom: localDateToDate(version.validFrom),
    coupleCents: BigInt(version.prices.coupleCents),
    soloCents: BigInt(version.prices.soloCents),
    extraAdultCents: BigInt(version.prices.extraAdultCents),
    childMidCents: BigInt(version.prices.childMidCents),
    childYoungCents: BigInt(version.prices.childYoungCents),
  };
}

function coverOf(row: { photos?: { storagePath: string }[] }): string | null {
  return row.photos?.[0]?.storagePath ?? null;
}

function toItineraryRecord(row: PrismaItinerary, coverStoragePath: string | null): ItineraryRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    difficulty: row.difficulty,
    status: row.status,
    kind: row.kind,
    childYoungMaxAge: row.childYoungMaxAge,
    childMidMaxAge: row.childMidMaxAge,
    coverStoragePath,
  };
}

function toPriceVersionRecord(row: PrismaPrice): PriceVersionRecord {
  return {
    id: row.id,
    validFrom: dateToLocalDate(row.validFrom),
    prices: {
      coupleCents: cents(Number(row.coupleCents)),
      soloCents: cents(Number(row.soloCents)),
      extraAdultCents: cents(Number(row.extraAdultCents)),
      childMidCents: cents(Number(row.childMidCents)),
      childYoungCents: cents(Number(row.childYoungCents)),
    },
  };
}

function localDateToDate(date: LocalDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function dateToLocalDate(date: Date): LocalDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

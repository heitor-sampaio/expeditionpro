import {
  addItineraryPriceVersion,
  createItinerary,
  listItineraries,
  listItineraryPhotos,
  listItineraryPriceVersions,
  resolveItineraryPrices,
  setItineraryPhotos,
  updateItinerary,
} from '@expedition/application';
import { z } from 'zod';
import type {
  ItineraryPhotoRecord,
  ItineraryRecord,
  PriceVersionRecord,
} from '@expedition/application';
import type { PriceTable } from '@expedition/domain';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * Rotas de roteiro (RO-01..03): criar com faixas + preço, listar, versionar preço
 * e resolver a tabela vigente numa data. Dinheiro em centavos (número) no JSON.
 */

const priceFields = {
  coupleCents: z.number().int().nonnegative(),
  soloCents: z.number().int().nonnegative(),
  extraAdultCents: z.number().int().nonnegative(),
  childMidCents: z.number().int().nonnegative(),
  childYoungCents: z.number().int().nonnegative(),
};
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'esperado YYYY-MM-DD');
const priceBody = z.object({ validFrom: isoDate, ...priceFields });

const createBody = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  difficulty: z.string().optional(),
  kind: z.enum(['catalog', 'custom']).optional(),
  childYoungMaxAge: z.number().int().positive().optional(),
  childMidMaxAge: z.number().int().positive().optional(),
  prices: priceBody,
});

const updateBody = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  difficulty: z.string().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  childYoungMaxAge: z.number().int().positive().optional(),
  childMidMaxAge: z.number().int().positive().optional(),
});

const photosBody = z.object({
  photos: z
    .array(
      z.object({
        storagePath: z.string().min(1),
        alt: z.string().nullish(),
        isCover: z.boolean().optional(),
      }),
    )
    .max(20),
});

export function registerItineraryRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post('/v1/itineraries', { schema: { body: createBody } }, async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const created = await createItinerary({ itineraries: deps.itineraries }, ctx, request.body);
    return reply.status(201).send(toDto(created));
  });

  typed.get('/v1/itineraries', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const rows = await listItineraries({ itineraries: deps.itineraries }, ctx);
    return reply.send(rows.map(toDto));
  });

  typed.patch(
    '/v1/itineraries/:id',
    { schema: { params: z.object({ id: z.string().min(1) }), body: updateBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const updated = await updateItinerary({ itineraries: deps.itineraries }, ctx, {
        id: request.params.id,
        ...request.body,
      });
      return reply.send(toDto(updated));
    },
  );

  typed.get(
    '/v1/itineraries/:id/photos',
    { schema: { params: z.object({ id: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const rows = await listItineraryPhotos({ itineraries: deps.itineraries }, ctx, {
        itineraryId: request.params.id,
      });
      return reply.send(rows.map(toPhotoDto));
    },
  );

  typed.put(
    '/v1/itineraries/:id/photos',
    { schema: { params: z.object({ id: z.string().min(1) }), body: photosBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const saved = await setItineraryPhotos({ itineraries: deps.itineraries }, ctx, {
        itineraryId: request.params.id,
        photos: request.body.photos,
      });
      return reply.send(saved.map(toPhotoDto));
    },
  );

  typed.post(
    '/v1/itineraries/:id/prices',
    { schema: { params: z.object({ id: z.string().min(1) }), body: priceBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await addItineraryPriceVersion({ itineraries: deps.itineraries }, ctx, {
        itineraryId: request.params.id,
        ...request.body,
      });
      return reply.status(201).send({ status: 'ok' });
    },
  );

  typed.get(
    '/v1/itineraries/:id/prices',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        querystring: z.object({ at: isoDate }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const table = await resolveItineraryPrices({ itineraries: deps.itineraries }, ctx, {
        itineraryId: request.params.id,
        atDate: request.query.at,
      });
      if (table === null) return reply.status(404).send({ error: 'no_price_for_date' });
      return reply.send(priceTableToDto(table));
    },
  );

  // RO-03: histórico de reajustes — todas as versões por valid_from (mais recente primeiro).
  typed.get(
    '/v1/itineraries/:id/price-versions',
    { schema: { params: z.object({ id: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const versions = await listItineraryPriceVersions({ itineraries: deps.itineraries }, ctx, {
        itineraryId: request.params.id,
      });
      return reply.send(versions.map(priceVersionDto));
    },
  );
}

function priceVersionDto(version: PriceVersionRecord) {
  const d = version.validFrom;
  const mm = String(d.month).padStart(2, '0');
  const dd = String(d.day).padStart(2, '0');
  return {
    id: version.id,
    validFrom: `${d.year}-${mm}-${dd}`,
    ...priceTableToDto(version.prices),
  };
}

function toDto(itinerary: ItineraryRecord) {
  return {
    id: itinerary.id,
    name: itinerary.name,
    slug: itinerary.slug,
    description: itinerary.description,
    difficulty: itinerary.difficulty,
    status: itinerary.status,
    kind: itinerary.kind,
    childYoungMaxAge: itinerary.childYoungMaxAge,
    childMidMaxAge: itinerary.childMidMaxAge,
    coverPath: itinerary.coverStoragePath,
  };
}

function toPhotoDto(photo: ItineraryPhotoRecord) {
  return {
    id: photo.id,
    storagePath: photo.storagePath,
    alt: photo.alt,
    position: photo.position,
    isCover: photo.isCover,
  };
}

function priceTableToDto(table: PriceTable) {
  return {
    coupleCents: Number(table.coupleCents),
    soloCents: Number(table.soloCents),
    extraAdultCents: Number(table.extraAdultCents),
    childMidCents: Number(table.childMidCents),
    childYoungCents: Number(table.childYoungCents),
  };
}

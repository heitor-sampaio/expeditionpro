import {
  getCommunicationConsents,
  getMediaConsents,
  setCommunicationConsent,
  setMediaConsent,
} from '@expedition/application';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * Consentimento de comunicação (§5.9 · DOC-06 · CM-04). O cliente lê e liga/desliga os
 * próprios canais (opt-out de um clique); a equipe consulta qualquer cliente. A guarda de
 * audiência (cliente só a si) vive no caso de uso. Marketing só — nunca execução de contrato.
 */
export function registerConsentRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const clock = () => deps.clock?.() ?? new Date();

  typed.get(
    '/v1/customers/:id/consents',
    { schema: { params: z.object({ id: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const state = await getCommunicationConsents({ consents: deps.consents }, ctx, {
        customerId: request.params.id,
      });
      return reply.send(state);
    },
  );

  typed.put(
    '/v1/customers/:id/consents/:channel',
    {
      schema: {
        params: z.object({ id: z.string().min(1), channel: z.enum(['email', 'push']) }),
        body: z.object({ granted: z.boolean() }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await setCommunicationConsent({ consents: deps.consents, clock }, ctx, {
        customerId: request.params.id,
        channel: request.params.channel,
        granted: request.body.granted,
      });
      const state = await getCommunicationConsents({ consents: deps.consents }, ctx, {
        customerId: request.params.id,
      });
      return reply.send(state);
    },
  );

  // CO-10 — consentimento de uso de imagem por escopo (community | marketing)
  typed.get(
    '/v1/customers/:id/media-consents',
    { schema: { params: z.object({ id: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const state = await getMediaConsents({ media: deps.media }, ctx, {
        customerId: request.params.id,
      });
      return reply.send(state);
    },
  );

  typed.put(
    '/v1/customers/:id/media-consents/:scope',
    {
      schema: {
        params: z.object({ id: z.string().min(1), scope: z.enum(['community', 'marketing']) }),
        body: z.object({ granted: z.boolean() }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await setMediaConsent({ media: deps.media, clock }, ctx, {
        customerId: request.params.id,
        scope: request.params.scope,
        granted: request.body.granted,
      });
      const state = await getMediaConsents({ media: deps.media }, ctx, {
        customerId: request.params.id,
      });
      return reply.send(state);
    },
  );
}

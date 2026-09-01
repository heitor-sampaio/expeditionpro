import {
  acceptTerm,
  getTermAcceptanceStatus,
  getTermEditorState,
  publishTermVersion,
  renderAcceptedTerm,
  saveTermDraft,
} from '@expedition/application';
import { z } from 'zod';
import type { DocumentVersionRecord, TermEditorState } from '@expedition/application';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * Termo de adesão (§5.13 · DOC-01..05). Equipe edita/publica em Configurações →
 * Documentos; o cliente consulta o status e aceita (portal). O conteúdo cru fica no
 * rascunho; publicar congela a versão. Sanitização por allowlist (DOC-09) entra depois.
 */
export function registerDocumentRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const clock = () => deps.clock?.() ?? new Date();

  // DOC-01 — estado do editor: rascunho + versão vigente (owner/admin)
  typed.get('/v1/documents/term', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const state = await getTermEditorState({ documents: deps.documents }, ctx);
    return reply.send(editorDto(state));
  });

  // DOC-01 — salvar rascunho
  typed.put(
    '/v1/documents/term/draft',
    { schema: { body: z.object({ markdown: z.string() }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const draft = await saveTermDraft({ documents: deps.documents }, ctx, {
        markdown: request.body.markdown,
      });
      return reply.send(versionDto(draft));
    },
  );

  // DOC-02/DOC-03 — publicar a versão (congela; marca se exige novo aceite)
  typed.post(
    '/v1/documents/term/publish',
    {
      schema: {
        body: z.object({
          requiresReacceptance: z.boolean(),
          changeSummary: z.string().trim().min(1).nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const published = await publishTermVersion({ documents: deps.documents, clock }, ctx, {
        requiresReacceptance: request.body.requiresReacceptance,
        changeSummary: request.body.changeSummary,
      });
      return reply.status(201).send(versionDto(published));
    },
  );

  // DOC-03/DOC-04 — status de aceite de um cliente (equipe qualquer; cliente só a si)
  typed.get(
    '/v1/customers/:id/term',
    { schema: { params: z.object({ id: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const status = await getTermAcceptanceStatus({ documents: deps.documents }, ctx, {
        customerId: request.params.id,
      });
      return reply.send(status);
    },
  );

  // DOC-04/DOC-05 — registrar o aceite (canal derivado do ator; IP/UA da requisição)
  typed.post(
    '/v1/customers/:id/term/accept',
    { schema: { params: z.object({ id: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const accepted = await acceptTerm({ documents: deps.documents, clock }, ctx, {
        customerId: request.params.id,
        channel: ctx.actor.kind === 'customer' ? 'portal' : 'admin',
        ip: clientIp(request),
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.status(201).send({
        id: accepted.id,
        documentVersionId: accepted.documentVersionId,
        acceptedAt: accepted.acceptedAt.toISOString(),
        channel: accepted.channel,
      });
    },
  );

  // DOC-08 — contrato aceito de uma inscrição, reconstruído sob demanda (texto + snapshot)
  typed.get(
    '/v1/bookings/:bookingId/term-document',
    { schema: { params: z.object({ bookingId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const rendered = await renderAcceptedTerm({ documents: deps.documents }, ctx, {
        bookingId: request.params.bookingId,
      });
      return reply.send({
        versionNumber: rendered.versionNumber,
        contentHtml: rendered.contentHtml,
        acceptedAt: rendered.acceptedAt.toISOString(),
      });
    },
  );
}

function clientIp(request: FastifyRequest): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return request.ip || null;
}

function versionDto(version: DocumentVersionRecord) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    contentJson: version.contentJson,
    contentHtml: version.contentHtml,
    changeSummary: version.changeSummary,
    requiresReacceptance: version.requiresReacceptance,
    publishedAt: version.publishedAt ? version.publishedAt.toISOString() : null,
    isDraft: version.publishedAt === null,
  };
}

function editorDto(state: TermEditorState) {
  return {
    documentId: state.documentId,
    draft: state.draft ? versionDto(state.draft) : null,
    current: state.current ? versionDto(state.current) : null,
  };
}

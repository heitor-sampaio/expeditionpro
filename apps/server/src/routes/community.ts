import {
  commentOnPost,
  createPost,
  deleteOwnComment,
  deleteOwnPost,
  getCommunityFeed,
  getModerationQueue,
  moderatePost,
  reportContent,
  resolveReport,
  setPostHighlight,
  togglePostLike,
} from '@expedition/application';
import { z } from 'zod';
import type { CommentRecord, PostRecord, ReportQueueItem } from '@expedition/application';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * Comunidade (§5.12). Feed do tenant (lêem equipe e cliente); postar/curtir/comentar/denunciar
 * é do cliente; moderar é da equipe. As regras de conteúdo e audiência vivem nos casos de uso.
 */
export function registerCommunityRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/v1/community/feed',
    {
      schema: {
        querystring: z.object({
          itineraryId: z.string().min(1).optional(),
          beforeId: z.string().min(1).optional(),
          limit: z.coerce.number().int().min(1).max(50).optional(),
          featured: z.coerce.boolean().optional(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const feed = await getCommunityFeed({ community: deps.community }, ctx, {
        limit: request.query.limit ?? 20,
        itineraryId: request.query.itineraryId,
        beforeId: request.query.beforeId,
        featuredOnly: request.query.featured,
      });
      const viewer = viewerCustomerId(ctx);
      return reply.send(feed.map((p) => postDto(p, viewer)));
    },
  );

  typed.post(
    '/v1/community/posts',
    {
      schema: {
        body: z.object({
          body: z.string().max(2000),
          itineraryId: z.string().min(1).nullish(),
          groupId: z.string().min(1).nullish(),
          layout: z.enum(['carousel', 'mosaic']).optional(),
          media: z
            .array(z.object({ storagePath: z.string().min(1), alt: z.string().nullish() }))
            .min(1)
            .max(3),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const post = await createPost({ community: deps.community }, ctx, {
        body: request.body.body,
        itineraryId: request.body.itineraryId ?? null,
        groupId: request.body.groupId ?? null,
        layout: request.body.layout ?? 'mosaic',
        media: request.body.media.map((m) => ({ storagePath: m.storagePath, alt: m.alt ?? null })),
      });
      return reply.status(201).send(postDto(post, viewerCustomerId(ctx)));
    },
  );

  typed.delete(
    '/v1/community/posts/:postId',
    { schema: { params: z.object({ postId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await deleteOwnPost({ community: deps.community }, ctx, request.params.postId);
      return reply.status(204).send();
    },
  );

  typed.delete(
    '/v1/community/comments/:commentId',
    { schema: { params: z.object({ commentId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await deleteOwnComment({ community: deps.community }, ctx, request.params.commentId);
      return reply.status(204).send();
    },
  );

  typed.post(
    '/v1/community/posts/:postId/like',
    { schema: { params: z.object({ postId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const result = await togglePostLike({ community: deps.community }, ctx, {
        postId: request.params.postId,
      });
      return reply.send(result);
    },
  );

  typed.get(
    '/v1/community/posts/:postId/comments',
    { schema: { params: z.object({ postId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      // Leitura direta do repo (equipe e cliente leem os comentários publicados).
      const rows = await deps.community.listComments(ctx.tenantId, request.params.postId);
      const viewer = viewerCustomerId(ctx);
      return reply.send(rows.map((row) => commentDto(row, viewer)));
    },
  );

  typed.post(
    '/v1/community/posts/:postId/comments',
    {
      schema: {
        params: z.object({ postId: z.string().min(1) }),
        body: z.object({ body: z.string().min(1).max(1000) }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const comment = await commentOnPost({ community: deps.community }, ctx, {
        postId: request.params.postId,
        body: request.body.body,
      });
      const viewer = viewerCustomerId(ctx);
      return reply.status(201).send(commentDto(comment, viewer));
    },
  );

  typed.post(
    '/v1/community/reports',
    {
      schema: {
        body: z.object({
          postId: z.string().min(1).nullish(),
          commentId: z.string().min(1).nullish(),
          reason: z.string().trim().min(1),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await reportContent({ community: deps.community }, ctx, {
        postId: request.body.postId ?? null,
        commentId: request.body.commentId ?? null,
        reason: request.body.reason,
      });
      return reply.status(201).send({ status: 'reported' });
    },
  );

  // CO-11 — destacar/curar um post (equipe)
  typed.post(
    '/v1/community/posts/:postId/highlight',
    {
      schema: {
        params: z.object({ postId: z.string().min(1) }),
        body: z.object({ featured: z.boolean() }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await setPostHighlight({ community: deps.community }, ctx, {
        postId: request.params.postId,
        featured: request.body.featured,
      });
      return reply.send({ featured: request.body.featured });
    },
  );

  // CO-08 — fila de denúncias abertas (equipe)
  typed.get('/v1/community/reports', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const queue = await getModerationQueue({ community: deps.community }, ctx);
    return reply.send(queue.map(reportDto));
  });

  typed.post(
    '/v1/community/reports/:reportId/resolve',
    {
      schema: {
        params: z.object({ reportId: z.string().min(1) }),
        body: z.object({ decision: z.enum(['resolved', 'dismissed']) }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await resolveReport({ community: deps.community }, ctx, {
        reportId: request.params.reportId,
        decision: request.body.decision,
      });
      return reply.send({ status: request.body.decision });
    },
  );

  typed.post(
    '/v1/community/posts/:postId/moderate',
    {
      schema: {
        params: z.object({ postId: z.string().min(1) }),
        body: z.object({
          action: z.enum(['hide', 'remove', 'restore']),
          reason: z.string().default(''),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await moderatePost({ community: deps.community }, ctx, {
        postId: request.params.postId,
        action: request.body.action,
        reason: request.body.reason,
      });
      return reply.send({ status: 'moderated' });
    },
  );
}

function postDto(post: PostRecord, viewerId: string | null) {
  return {
    id: post.id,
    authorName: post.authorName,
    body: post.body,
    itineraryId: post.itineraryId,
    groupId: post.groupId,
    layout: post.layout,
    createdAt: post.createdAt.toISOString(),
    media: post.media.map((m) => ({ storagePath: m.storagePath, alt: m.alt })),
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    likedByViewer: post.likedByViewer,
    featured: post.featured,
    official: post.official,
    mine: viewerId !== null && post.authorCustomerId === viewerId,
  };
}

/** Id do cliente que está lendo (null para a equipe) — decide `mine`/`likedByViewer`. */
function viewerCustomerId(ctx: { actor: { kind: string; customerId?: string } }): string | null {
  return ctx.actor.kind === 'customer' ? (ctx.actor.customerId ?? null) : null;
}

/**
 * O `mine` sai daqui, como no post: a tela precisa saber se pode oferecer "Apagar", e
 * mandar o `authorCustomerId` só para isso exporia o id de quem comentou em todo post.
 */
function commentDto(comment: CommentRecord, viewerId: string | null) {
  return {
    id: comment.id,
    authorName: comment.authorName,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    mine: viewerId !== null && comment.authorCustomerId === viewerId,
  };
}

function reportDto(item: ReportQueueItem) {
  return {
    id: item.id,
    reason: item.reason,
    reporterName: item.reporterName,
    createdAt: item.createdAt.toISOString(),
    postId: item.postId,
    commentId: item.commentId,
    postAuthorName: item.postAuthorName,
    postBody: item.postBody,
    postStatus: item.postStatus,
  };
}

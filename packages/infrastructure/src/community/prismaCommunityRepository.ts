import type {
  CommentRecord,
  CommunityRepository,
  FeedQuery,
  NewComment,
  NewPost,
  NewReport,
  PostRecord,
  ReportDecision,
  ReportQueueItem,
} from '@expedition/application';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma da comunidade (§5.12). Feed por tenant, contagens derivadas
 * (curtidas/comentários), `likedByViewer` por leitor. O `author_customer_id` vira nome
 * pela junção com o cliente. Tudo escopado pela Client Extension + RLS por audiência.
 */
export function prismaCommunityRepository(base: PrismaClient): CommunityRepository {
  const include = {
    media: { orderBy: { position: 'asc' as const } },
    author: { select: { fullName: true } },
    tenant: { select: { name: true } },
    _count: { select: { likes: true, comments: true } },
  };

  const toRecord = (row: PostWithRels, likedByViewer: boolean): PostRecord => ({
    id: row.id,
    authorCustomerId: row.authorCustomerId,
    // Post oficial (sem cliente autor) aparece como a marca (nome do tenant).
    authorName: row.author?.fullName ?? row.tenant.name,
    official: row.authorCustomerId === null,
    body: row.body,
    itineraryId: row.itineraryId,
    groupId: row.groupId,
    layout: row.layout === 'carousel' ? 'carousel' : 'mosaic',
    status: row.status,
    createdAt: row.createdAt,
    media: row.media.map((m) => ({ storagePath: m.storagePath, alt: m.alt, position: m.position })),
    likeCount: row._count.likes,
    commentCount: row._count.comments,
    likedByViewer,
    featured: row.featuredAt !== null,
  });

  const likedSet = async (
    db: ReturnType<typeof tenantClient>,
    postIds: string[],
    viewerId: string | null,
  ): Promise<Set<string>> => {
    if (viewerId === null || postIds.length === 0) return new Set();
    const rows = await db.postLike.findMany({
      where: { likerId: viewerId, postId: { in: postIds } },
      select: { postId: true },
    });
    return new Set(rows.map((r) => r.postId));
  };

  return {
    async createPost(input: NewPost): Promise<PostRecord> {
      const db = tenantClient(base, input.tenantId);
      const created = await db.post.create({
        data: {
          tenantId: input.tenantId,
          authorCustomerId: input.authorCustomerId,
          body: input.body,
          itineraryId: input.itineraryId,
          groupId: input.groupId,
          layout: input.layout,
          media: {
            create: input.media.map((m, i) => ({
              storagePath: m.storagePath,
              alt: m.alt,
              position: i,
            })),
          },
        },
        include,
      });
      return toRecord(created, false);
    },

    async getPost(tenantId, postId, viewerCustomerId): Promise<PostRecord | null> {
      const db = tenantClient(base, tenantId);
      const row = await db.post.findFirst({ where: { id: postId, deletedAt: null }, include });
      if (!row) return null;
      const liked = await likedSet(db, [row.id], viewerCustomerId);
      return toRecord(row, liked.has(row.id));
    },

    async listFeed(tenantId, query: FeedQuery): Promise<PostRecord[]> {
      const db = tenantClient(base, tenantId);
      let createdBefore: Date | undefined;
      if (query.beforeId) {
        const anchor = await db.post.findFirst({
          where: { id: query.beforeId },
          select: { createdAt: true },
        });
        createdBefore = anchor?.createdAt;
      }
      const rows = await db.post.findMany({
        where: {
          status: 'published',
          deletedAt: null,
          ...(query.itineraryId ? { itineraryId: query.itineraryId } : {}),
          ...(query.featuredOnly ? { featuredAt: { not: null } } : {}),
          ...(createdBefore ? { createdAt: { lt: createdBefore } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        include,
      });
      const liked = await likedSet(
        db,
        rows.map((r) => r.id),
        query.viewerCustomerId,
      );
      return rows.map((r) => toRecord(r, liked.has(r.id)));
    },

    async toggleLike(tenantId, postId, likerId): Promise<{ liked: boolean; likeCount: number }> {
      // findFirst/deleteMany com campos separados: o tenantClient injeta o tenantId neles.
      // (findUnique com a chave composta `postId_likerId` não passa pela injeção de tenant.)
      const db = tenantClient(base, tenantId);
      const existing = await db.postLike.findFirst({ where: { postId, likerId } });
      let liked: boolean;
      if (existing) {
        await db.postLike.deleteMany({ where: { postId, likerId } });
        liked = false;
      } else {
        await db.postLike.create({ data: { tenantId, postId, likerId } });
        liked = true;
      }
      const likeCount = await db.postLike.count({ where: { postId } });
      return { liked, likeCount };
    },

    async addComment(input: NewComment): Promise<CommentRecord> {
      const db = tenantClient(base, input.tenantId);
      const row = await db.postComment.create({
        data: {
          tenantId: input.tenantId,
          postId: input.postId,
          authorCustomerId: input.authorCustomerId,
          body: input.body,
        },
        include: { author: { select: { fullName: true } }, tenant: { select: { name: true } } },
      });
      return {
        id: row.id,
        postId: row.postId,
        authorCustomerId: row.authorCustomerId,
        authorName: row.author?.fullName ?? row.tenant.name,
        body: row.body,
        createdAt: row.createdAt,
      };
    },

    async listComments(tenantId, postId): Promise<CommentRecord[]> {
      const rows = await tenantClient(base, tenantId).postComment.findMany({
        where: { postId, status: 'published' },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { fullName: true } }, tenant: { select: { name: true } } },
      });
      return rows.map((row) => ({
        id: row.id,
        postId: row.postId,
        authorCustomerId: row.authorCustomerId,
        authorName: row.author?.fullName ?? row.tenant.name,
        body: row.body,
        createdAt: row.createdAt,
      }));
    },

    async addReport(input: NewReport): Promise<void> {
      await tenantClient(base, input.tenantId).postReport.create({
        data: {
          tenantId: input.tenantId,
          postId: input.postId,
          commentId: input.commentId,
          reporterCustomerId: input.reporterCustomerId,
          reason: input.reason,
        },
      });
    },

    async setPostStatus(tenantId, postId, status, reason): Promise<void> {
      await tenantClient(base, tenantId).post.updateMany({
        where: { id: postId },
        data: { status, removedReason: reason },
      });
    },

    async deletePost(tenantId, postId): Promise<void> {
      await tenantClient(base, tenantId).post.updateMany({
        where: { id: postId },
        data: { deletedAt: new Date() },
      });
    },

    async setPostFeatured(tenantId, postId, featured): Promise<void> {
      await tenantClient(base, tenantId).post.updateMany({
        where: { id: postId },
        data: { featuredAt: featured ? new Date() : null },
      });
    },

    async listOpenReports(tenantId): Promise<ReportQueueItem[]> {
      const db = tenantClient(base, tenantId);
      const rows = await db.postReport.findMany({
        where: { status: 'open' },
        orderBy: { createdAt: 'desc' },
        include: { reporter: { select: { fullName: true } } },
      });
      // O `post_id` não tem relação no schema (é polimórfico com comentário): busca à parte.
      const postIds = [...new Set(rows.map((r) => r.postId).filter((id): id is string => !!id))];
      const postRows = postIds.length
        ? await db.post.findMany({
            where: { id: { in: postIds } },
            include: { author: { select: { fullName: true } } },
          })
        : [];
      const postById = new Map(postRows.map((p) => [p.id, p]));
      return rows.map((r) => {
        const post = r.postId ? postById.get(r.postId) : undefined;
        return {
          id: r.id,
          reason: r.reason,
          reporterName: r.reporter.fullName,
          createdAt: r.createdAt,
          postId: r.postId,
          commentId: r.commentId,
          postAuthorName: post?.author?.fullName ?? null,
          postBody: post?.body ?? null,
          postStatus: post?.status ?? null,
        };
      });
    },

    async resolveReport(
      tenantId,
      reportId,
      decision: ReportDecision,
      resolvedBy: string,
    ): Promise<void> {
      await tenantClient(base, tenantId).postReport.updateMany({
        where: { id: reportId },
        data: { status: decision, resolvedBy, resolvedAt: new Date() },
      });
    },
  };
}

// Tipo do `findMany`/`create` com os includes acima — sem depender do namespace gerado.
interface PostWithRels {
  id: string;
  authorCustomerId: string | null;
  body: string;
  itineraryId: string | null;
  groupId: string | null;
  layout: string;
  status: string;
  createdAt: Date;
  featuredAt: Date | null;
  media: { storagePath: string; alt: string | null; position: number }[];
  author: { fullName: string } | null;
  tenant: { name: string };
  _count: { likes: number; comments: number };
}

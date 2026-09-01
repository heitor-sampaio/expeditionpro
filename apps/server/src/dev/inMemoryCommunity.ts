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

/**
 * Comunidade em memória — SÓ para dev e testes de rota. Nome do autor pelo mapa de
 * clientes do dev (se houver), senão o próprio id. Contagens e `likedByViewer` derivados.
 */
export function inMemoryCommunity(
  names: Record<string, string> = {},
  brandName = 'Drakkar',
): CommunityRepository {
  interface P {
    id: string;
    tenantId: string;
    authorCustomerId: string | null;
    body: string;
    itineraryId: string | null;
    groupId: string | null;
    layout: 'carousel' | 'mosaic';
    status: string;
    createdAt: Date;
    featuredAt: Date | null;
    deletedAt: Date | null;
    media: { storagePath: string; alt: string | null; position: number }[];
  }
  const posts: P[] = [];
  const reports: {
    id: string;
    tenantId: string;
    postId: string | null;
    commentId: string | null;
    reporterCustomerId: string;
    reason: string;
    status: string;
    createdAt: Date;
  }[] = [];
  const likes: { tenantId: string; postId: string; likerId: string }[] = [];
  const comments: {
    id: string;
    tenantId: string;
    postId: string;
    authorCustomerId: string | null;
    body: string;
    createdAt: Date;
  }[] = [];
  let seq = 0;
  const nameOf = (id: string) => names[id] ?? id;

  const toRecord = (row: P, viewer: string | null): PostRecord => ({
    id: row.id,
    authorCustomerId: row.authorCustomerId,
    authorName: row.authorCustomerId === null ? brandName : nameOf(row.authorCustomerId),
    official: row.authorCustomerId === null,
    body: row.body,
    itineraryId: row.itineraryId,
    groupId: row.groupId,
    layout: row.layout,
    status: row.status,
    createdAt: row.createdAt,
    media: [...row.media].sort((a, b) => a.position - b.position),
    likeCount: likes.filter((l) => l.postId === row.id).length,
    commentCount: comments.filter((c) => c.postId === row.id).length,
    likedByViewer:
      viewer !== null && likes.some((l) => l.postId === row.id && l.likerId === viewer),
    featured: row.featuredAt !== null,
  });

  return {
    createPost(input: NewPost) {
      seq += 1;
      const row: P = {
        id: `post-${seq}`,
        tenantId: input.tenantId,
        authorCustomerId: input.authorCustomerId,
        body: input.body,
        itineraryId: input.itineraryId,
        groupId: input.groupId,
        layout: input.layout,
        status: 'published',
        createdAt: new Date(Date.now() + seq),
        featuredAt: null,
        deletedAt: null,
        media: input.media.map((m, i) => ({ storagePath: m.storagePath, alt: m.alt, position: i })),
      };
      posts.push(row);
      return Promise.resolve(toRecord(row, input.authorCustomerId));
    },
    getPost(tenantId, postId, viewer) {
      const row = posts.find(
        (p) => p.tenantId === tenantId && p.id === postId && p.deletedAt === null,
      );
      return Promise.resolve(row ? toRecord(row, viewer) : null);
    },
    deletePost(tenantId, postId) {
      const row = posts.find((p) => p.tenantId === tenantId && p.id === postId);
      if (row) row.deletedAt = new Date();
      return Promise.resolve();
    },
    listFeed(tenantId, query: FeedQuery) {
      let rows = posts
        .filter((p) => p.tenantId === tenantId && p.status === 'published' && p.deletedAt === null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (query.itineraryId) rows = rows.filter((p) => p.itineraryId === query.itineraryId);
      if (query.featuredOnly) rows = rows.filter((p) => p.featuredAt !== null);
      if (query.beforeId) {
        const anchor = posts.find((p) => p.id === query.beforeId);
        if (anchor) rows = rows.filter((p) => p.createdAt.getTime() < anchor.createdAt.getTime());
      }
      return Promise.resolve(
        rows.slice(0, query.limit).map((r) => toRecord(r, query.viewerCustomerId)),
      );
    },
    toggleLike(tenantId, postId, likerId) {
      const idx = likes.findIndex(
        (l) => l.tenantId === tenantId && l.postId === postId && l.likerId === likerId,
      );
      let liked: boolean;
      if (idx === -1) {
        likes.push({ tenantId, postId, likerId });
        liked = true;
      } else {
        likes.splice(idx, 1);
        liked = false;
      }
      return Promise.resolve({ liked, likeCount: likes.filter((l) => l.postId === postId).length });
    },
    addComment(input: NewComment) {
      seq += 1;
      const row = {
        id: `comment-${seq}`,
        tenantId: input.tenantId,
        postId: input.postId,
        authorCustomerId: input.authorCustomerId,
        body: input.body,
        createdAt: new Date(Date.now() + seq),
      };
      comments.push(row);
      return Promise.resolve({
        id: row.id,
        postId: row.postId,
        authorCustomerId: row.authorCustomerId,
        authorName: row.authorCustomerId === null ? brandName : nameOf(row.authorCustomerId),
        body: row.body,
        createdAt: row.createdAt,
      } satisfies CommentRecord);
    },
    listComments(tenantId, postId) {
      const rows = comments
        .filter((c) => c.tenantId === tenantId && c.postId === postId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((c) => ({
          id: c.id,
          postId: c.postId,
          authorCustomerId: c.authorCustomerId,
          authorName: c.authorCustomerId === null ? brandName : nameOf(c.authorCustomerId),
          body: c.body,
          createdAt: c.createdAt,
        }));
      return Promise.resolve(rows);
    },
    addReport(input: NewReport) {
      seq += 1;
      reports.push({
        id: `report-${seq}`,
        tenantId: input.tenantId,
        postId: input.postId,
        commentId: input.commentId,
        reporterCustomerId: input.reporterCustomerId,
        reason: input.reason,
        status: 'open',
        createdAt: new Date(Date.now() + seq),
      });
      return Promise.resolve();
    },
    setPostStatus(tenantId, postId, status) {
      const row = posts.find((p) => p.tenantId === tenantId && p.id === postId);
      if (row) row.status = status;
      return Promise.resolve();
    },
    setPostFeatured(tenantId, postId, featured) {
      const row = posts.find((p) => p.tenantId === tenantId && p.id === postId);
      if (row) row.featuredAt = featured ? new Date(0) : null;
      return Promise.resolve();
    },
    listOpenReports(tenantId): Promise<ReportQueueItem[]> {
      const items = reports
        .filter((r) => r.tenantId === tenantId && r.status === 'open')
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((r) => {
          const post = r.postId ? posts.find((p) => p.id === r.postId) : undefined;
          return {
            id: r.id,
            reason: r.reason,
            reporterName: nameOf(r.reporterCustomerId),
            createdAt: r.createdAt,
            postId: r.postId,
            commentId: r.commentId,
            postAuthorName: post
              ? post.authorCustomerId === null
                ? brandName
                : nameOf(post.authorCustomerId)
              : null,
            postBody: post ? post.body : null,
            postStatus: post ? post.status : null,
          };
        });
      return Promise.resolve(items);
    },
    resolveReport(tenantId, reportId, _decision: ReportDecision) {
      const row = reports.find((r) => r.tenantId === tenantId && r.id === reportId);
      if (row) row.status = _decision;
      return Promise.resolve();
    },
  };
}

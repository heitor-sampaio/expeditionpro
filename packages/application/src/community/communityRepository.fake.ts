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
} from './communityRepository.js';

interface PostRow {
  id: string;
  tenantId: string;
  authorCustomerId: string | null;
  body: string;
  itineraryId: string | null;
  groupId: string | null;
  layout: 'carousel' | 'mosaic';
  status: string;
  createdAt: Date;
  media: { storagePath: string; alt: string | null; position: number }[];
  removedReason: string | null;
  featuredAt: Date | null;
  deletedAt: Date | null;
}
interface LikeRow {
  tenantId: string;
  postId: string;
  customerId: string;
}
interface CommentRow {
  id: string;
  tenantId: string;
  postId: string;
  authorCustomerId: string | null;
  body: string;
  createdAt: Date;
  deletedAt: Date | null;
}
interface ReportRow extends NewReport {
  id: string;
  status: string;
  createdAt: Date;
  resolvedBy: string | null;
}

/** Fake in-memory da comunidade. Excluído do build (`*.fake.ts`). */
export function fakeCommunityRepository(
  names: Record<string, string> = {},
  brandName = 'Drakkar',
): CommunityRepository & {
  posts: PostRow[];
  likes: LikeRow[];
  comments: CommentRow[];
  reports: ReportRow[];
} {
  const posts: PostRow[] = [];
  const likes: LikeRow[] = [];
  const comments: CommentRow[] = [];
  const reports: ReportRow[] = [];
  let seq = 0;
  const nameOf = (id: string) => names[id] ?? id;

  const toRecord = (row: PostRow, viewer: string | null): PostRecord => ({
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
    commentCount: comments.filter((c) => c.postId === row.id && c.deletedAt === null).length,
    likedByViewer:
      viewer !== null && likes.some((l) => l.postId === row.id && l.customerId === viewer),
    featured: row.featuredAt !== null,
  });

  return {
    posts,
    likes,
    comments,
    reports,

    createPost(input: NewPost) {
      seq += 1;
      const row: PostRow = {
        id: `post-${seq}`,
        tenantId: input.tenantId,
        authorCustomerId: input.authorCustomerId,
        body: input.body,
        itineraryId: input.itineraryId,
        groupId: input.groupId,
        layout: input.layout,
        status: 'published',
        createdAt: new Date(seq * 1000),
        media: input.media.map((m, i) => ({ storagePath: m.storagePath, alt: m.alt, position: i })),
        removedReason: null,
        featuredAt: null,
        deletedAt: null,
      };
      posts.push(row);
      return Promise.resolve(toRecord(row, input.authorCustomerId));
    },

    getPost(tenantId: string, postId: string, viewer: string | null) {
      const row = posts.find((p) => p.tenantId === tenantId && p.id === postId);
      return Promise.resolve(row ? toRecord(row, viewer) : null);
    },

    deletePost(tenantId: string, postId: string) {
      const row = posts.find((p) => p.tenantId === tenantId && p.id === postId);
      if (row) row.deletedAt = new Date(1);
      return Promise.resolve();
    },

    listFeed(tenantId: string, query: FeedQuery) {
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

    toggleLike(tenantId: string, postId: string, customerId: string) {
      const idx = likes.findIndex(
        (l) => l.tenantId === tenantId && l.postId === postId && l.customerId === customerId,
      );
      let liked: boolean;
      if (idx === -1) {
        likes.push({ tenantId, postId, customerId });
        liked = true;
      } else {
        likes.splice(idx, 1);
        liked = false;
      }
      return Promise.resolve({ liked, likeCount: likes.filter((l) => l.postId === postId).length });
    },

    addComment(input: NewComment) {
      seq += 1;
      const row: CommentRow = {
        id: `comment-${seq}`,
        tenantId: input.tenantId,
        postId: input.postId,
        authorCustomerId: input.authorCustomerId,
        body: input.body,
        createdAt: new Date(seq * 1000),
        deletedAt: null,
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

    findComment(tenantId: string, commentId: string) {
      const c = comments.find(
        (x) => x.tenantId === tenantId && x.id === commentId && x.deletedAt === null,
      );
      return Promise.resolve(
        c
          ? ({
              id: c.id,
              postId: c.postId,
              authorCustomerId: c.authorCustomerId,
              authorName: c.authorCustomerId === null ? brandName : nameOf(c.authorCustomerId),
              body: c.body,
              createdAt: c.createdAt,
            } satisfies CommentRecord)
          : null,
      );
    },

    deleteComment(tenantId: string, commentId: string) {
      const c = comments.find((x) => x.tenantId === tenantId && x.id === commentId);
      if (c) c.deletedAt = new Date();
      return Promise.resolve();
    },

    listComments(tenantId: string, postId: string) {
      const rows = comments
        .filter((c) => c.tenantId === tenantId && c.postId === postId && c.deletedAt === null)
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
        ...input,
        id: `report-${seq}`,
        status: 'open',
        createdAt: new Date(seq * 1000),
        resolvedBy: null,
      });
      return Promise.resolve();
    },

    setPostStatus(tenantId: string, postId: string, status: string, reason: string) {
      const row = posts.find((p) => p.tenantId === tenantId && p.id === postId);
      if (row) {
        row.status = status;
        row.removedReason = reason;
      }
      return Promise.resolve();
    },

    setPostFeatured(tenantId: string, postId: string, featured: boolean) {
      const row = posts.find((p) => p.tenantId === tenantId && p.id === postId);
      if (row) row.featuredAt = featured ? new Date(0) : null;
      return Promise.resolve();
    },

    listOpenReports(tenantId: string): Promise<ReportQueueItem[]> {
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
            postAuthorName: post?.authorCustomerId ? nameOf(post.authorCustomerId) : null,
            postBody: post ? post.body : null,
            postStatus: post ? post.status : null,
          } satisfies ReportQueueItem;
        });
      return Promise.resolve(items);
    },

    resolveReport(
      tenantId: string,
      reportId: string,
      decision: ReportDecision,
      resolvedBy: string,
    ) {
      const row = reports.find((r) => r.tenantId === tenantId && r.id === reportId);
      if (row) {
        row.status = decision;
        row.resolvedBy = resolvedBy;
      }
      return Promise.resolve();
    },
  };
}

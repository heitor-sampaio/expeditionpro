/**
 * Port da comunidade (§5.12). Feed do tenant: posts (foto com legenda), curtidas,
 * comentários e denúncias. Comunidade fechada e **por tenant** — nada cross-tenant. O
 * post publica direto (CO-07); a moderação é reativa (CO-08). Escrita mediada pelo servidor.
 */

import type { PostLayout } from '@expedition/domain';

export interface NewPostMedia {
  readonly storagePath: string;
  readonly alt: string | null;
}

export interface NewPost {
  readonly tenantId: string;
  /** Nulo = post oficial da marca (equipe). Preenchido = post do cliente. */
  readonly authorCustomerId: string | null;
  readonly body: string;
  readonly itineraryId: string | null;
  readonly groupId: string | null;
  readonly layout: PostLayout;
  readonly media: readonly NewPostMedia[];
}

export interface PostMediaRecord {
  readonly storagePath: string;
  readonly alt: string | null;
  readonly position: number;
}

export interface PostRecord {
  readonly id: string;
  readonly authorCustomerId: string | null;
  readonly authorName: string;
  /** Post da marca (equipe), exibido com selo oficial. */
  readonly official: boolean;
  readonly body: string;
  readonly itineraryId: string | null;
  readonly groupId: string | null;
  readonly layout: PostLayout;
  readonly status: string; // published | flagged | removed
  readonly createdAt: Date;
  readonly media: readonly PostMediaRecord[];
  readonly likeCount: number;
  readonly commentCount: number;
  readonly likedByViewer: boolean;
  readonly featured: boolean;
}

export interface FeedQuery {
  readonly itineraryId?: string | undefined;
  readonly limit: number;
  /** Cursor: só posts criados antes deste id (paginação estável). */
  readonly beforeId?: string | undefined;
  /** Cliente que está lendo, para marcar `likedByViewer`. Null para a equipe. */
  readonly viewerCustomerId: string | null;
  /** CO-11: só os posts em destaque (para a página do roteiro). */
  readonly featuredOnly?: boolean | undefined;
}

export interface NewComment {
  readonly tenantId: string;
  readonly postId: string;
  /** Nulo = comentário oficial da marca (equipe). */
  readonly authorCustomerId: string | null;
  readonly body: string;
}

export interface CommentRecord {
  readonly id: string;
  readonly postId: string;
  readonly authorCustomerId: string | null;
  readonly authorName: string;
  readonly body: string;
  readonly createdAt: Date;
}

export interface NewReport {
  readonly tenantId: string;
  readonly postId: string | null;
  readonly commentId: string | null;
  readonly reporterCustomerId: string;
  readonly reason: string;
}

/** Denúncia aberta, enriquecida para a fila de moderação (CO-08). */
export interface ReportQueueItem {
  readonly id: string;
  readonly reason: string;
  readonly reporterName: string;
  readonly createdAt: Date;
  readonly postId: string | null;
  readonly commentId: string | null;
  readonly postAuthorName: string | null;
  readonly postBody: string | null;
  readonly postStatus: string | null;
}

export type ReportDecision = 'resolved' | 'dismissed';

export interface CommunityRepository {
  createPost(input: NewPost): Promise<PostRecord>;
  getPost(
    tenantId: string,
    postId: string,
    viewerCustomerId: string | null,
  ): Promise<PostRecord | null>;
  listFeed(tenantId: string, query: FeedQuery): Promise<PostRecord[]>;
  /** Alterna a curtida de quem age (cliente ou equipe) e devolve o estado. `likerId` é o id
   *  do cliente OU do usuário da equipe (curtida como a marca). */
  toggleLike(
    tenantId: string,
    postId: string,
    likerId: string,
  ): Promise<{ liked: boolean; likeCount: number }>;
  addComment(input: NewComment): Promise<CommentRecord>;
  listComments(tenantId: string, postId: string): Promise<CommentRecord[]>;
  /** CO-10: o comentário pelo id, para conferir o dono antes de apagar. */
  findComment(tenantId: string, commentId: string): Promise<CommentRecord | null>;
  /** CO-10: exclusão lógica — a conversa fica na tabela para denúncia e moderação. */
  deleteComment(tenantId: string, commentId: string): Promise<void>;
  addReport(input: NewReport): Promise<void>;
  /** Moderação (CO-08): oculta/remove um post com motivo. */
  setPostStatus(tenantId: string, postId: string, status: string, reason: string): Promise<void>;
  /** O autor apaga o próprio post (CO-09): soft-delete, sai do feed. */
  deletePost(tenantId: string, postId: string): Promise<void>;
  /** Curadoria (CO-11): marca/desmarca o post como destaque. */
  setPostFeatured(tenantId: string, postId: string, featured: boolean): Promise<void>;
  /** Fila de denúncias abertas (CO-08), mais recentes primeiro. */
  listOpenReports(tenantId: string): Promise<ReportQueueItem[]>;
  /** Resolve/descarta uma denúncia, com quem e quando. */
  resolveReport(
    tenantId: string,
    reportId: string,
    decision: ReportDecision,
    resolvedBy: string,
  ): Promise<void>;
}

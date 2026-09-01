import { validatePostContent, normalizePostLayout } from '@expedition/domain';
import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CommunityRepository, NewPostMedia, PostRecord } from './communityRepository.js';

/**
 * CO-01/CO-07 — publica um post na comunidade. Foto com legenda (1 a 10 fotos, legenda até
 * 2.000), **publica direto**, sem aprovação. Só o cliente é autor (a equipe modera, não posta).
 */

export interface CreatePostDeps {
  readonly community: CommunityRepository;
}

export interface CreatePostCommand {
  readonly body: string;
  readonly itineraryId: string | null;
  readonly groupId: string | null;
  readonly layout: string;
  readonly media: readonly NewPostMedia[];
}

/**
 * Autor de post/comentário: o cliente é ele mesmo; a equipe é a **marca** (null → oficial).
 * Outros papéis não escrevem na comunidade.
 */
export function communityAuthorCustomerId(ctx: RequestContext): string | null {
  const { actor } = ctx;
  if (actor.kind === 'customer') return actor.customerId;
  if (actor.kind === 'team') return null;
  throw new ForbiddenError('Só cliente ou equipe escreve na comunidade');
}

/** Quem age (curtir, likedByViewer): o id do cliente OU do usuário da equipe. */
export function communityActorId(ctx: RequestContext): string {
  const { actor } = ctx;
  if (actor.kind === 'customer') return actor.customerId;
  if (actor.kind === 'team') return actor.userId;
  throw new ForbiddenError('Só cliente ou equipe age na comunidade');
}

export async function createPost(
  deps: CreatePostDeps,
  ctx: RequestContext,
  command: CreatePostCommand,
): Promise<PostRecord> {
  const authorCustomerId = communityAuthorCustomerId(ctx);
  validatePostContent({ mediaCount: command.media.length, caption: command.body });
  return deps.community.createPost({
    tenantId: ctx.tenantId,
    authorCustomerId,
    body: command.body,
    itineraryId: command.itineraryId,
    groupId: command.groupId,
    layout: normalizePostLayout(command.layout),
    media: command.media,
  });
}

/** A comunidade é de clientes: postar, curtir, comentar e denunciar exige ator cliente. */
export function requireCustomer(ctx: RequestContext): string {
  if (ctx.actor.kind !== 'customer') {
    throw new ForbiddenError('Ação da comunidade é do cliente');
  }
  return ctx.actor.customerId;
}

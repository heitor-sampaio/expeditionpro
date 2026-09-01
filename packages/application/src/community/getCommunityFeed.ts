import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CommunityRepository, PostRecord } from './communityRepository.js';

/**
 * CO-03 — feed do tenant: posts publicados, cronológico (mais recentes primeiro), com
 * filtro por roteiro e paginação por cursor. Lêem a equipe e o cliente (comunidade fechada,
 * mas quem tem conta lê). `likedByViewer` reflete quem está lendo.
 */

export interface GetCommunityFeedDeps {
  readonly community: CommunityRepository;
}

export interface GetCommunityFeedCommand {
  readonly limit: number;
  readonly itineraryId?: string | undefined;
  readonly beforeId?: string | undefined;
  readonly featuredOnly?: boolean | undefined;
}

export async function getCommunityFeed(
  deps: GetCommunityFeedDeps,
  ctx: RequestContext,
  command: GetCommunityFeedCommand,
): Promise<PostRecord[]> {
  if (ctx.actor.kind !== 'customer' && ctx.actor.kind !== 'team') {
    throw new ForbiddenError('Feed da comunidade');
  }
  // "viewer" para `likedByViewer`: o id de quem lê — cliente OU usuário da equipe.
  const viewerCustomerId =
    ctx.actor.kind === 'customer'
      ? ctx.actor.customerId
      : ctx.actor.kind === 'team'
        ? ctx.actor.userId
        : null;
  const limit = Math.min(Math.max(command.limit, 1), 50);
  return deps.community.listFeed(ctx.tenantId, {
    itineraryId: command.itineraryId,
    beforeId: command.beforeId,
    featuredOnly: command.featuredOnly,
    limit,
    viewerCustomerId,
  });
}

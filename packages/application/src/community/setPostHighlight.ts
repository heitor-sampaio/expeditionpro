import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CommunityRepository } from './communityRepository.js';

/**
 * CO-11 — curadoria: a equipe marca (ou desmarca) um post como destaque, para exibir na
 * página do roteiro. Só a equipe.
 */

export interface SetPostHighlightDeps {
  readonly community: CommunityRepository;
}

export interface SetPostHighlightCommand {
  readonly postId: string;
  readonly featured: boolean;
}

export async function setPostHighlight(
  deps: SetPostHighlightDeps,
  ctx: RequestContext,
  command: SetPostHighlightCommand,
): Promise<void> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('Curadoria é da equipe');
  }
  await deps.community.setPostFeatured(ctx.tenantId, command.postId, command.featured);
}

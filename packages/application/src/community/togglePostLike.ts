import { communityActorId } from './createPost.js';
import { requireOpenPost } from './postAccess.js';
import type { RequestContext } from '../context.js';
import type { CommunityRepository } from './communityRepository.js';

/** CO-04 — curtir/descurtir um post (alterna). Cliente ou equipe (curtir como a marca). */

export interface TogglePostLikeDeps {
  readonly community: CommunityRepository;
}

export async function togglePostLike(
  deps: TogglePostLikeDeps,
  ctx: RequestContext,
  command: { readonly postId: string },
): Promise<{ liked: boolean; likeCount: number }> {
  // CO-08: post fora do ar (ou de outro tenant) não recebe curtida.
  await requireOpenPost(deps.community, ctx, command.postId);
  return deps.community.toggleLike(ctx.tenantId, command.postId, communityActorId(ctx));
}

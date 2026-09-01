import { ForbiddenError, NotFoundError } from '../errors.js';
import { requireCustomer } from './createPost.js';
import type { RequestContext } from '../context.js';
import type { CommunityRepository } from './communityRepository.js';

/**
 * CO-09 — o autor apaga a própria publicação. Só o dono: o cliente autenticado tem de ser o
 * autor do post (a equipe usa a moderação, não isto). Soft-delete no repositório.
 */

export interface DeleteOwnPostDeps {
  readonly community: CommunityRepository;
}

export async function deleteOwnPost(
  deps: DeleteOwnPostDeps,
  ctx: RequestContext,
  postId: string,
): Promise<void> {
  const customerId = requireCustomer(ctx);
  const post = await deps.community.getPost(ctx.tenantId, postId, customerId);
  if (!post) throw new NotFoundError('post');
  if (post.authorCustomerId !== customerId) {
    throw new ForbiddenError('Só o autor apaga a própria publicação');
  }
  await deps.community.deletePost(ctx.tenantId, postId);
}

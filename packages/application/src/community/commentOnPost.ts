import { validateComment } from '@expedition/domain';
import { requireOpenPost } from './postAccess.js';
import { communityAuthorCustomerId } from './createPost.js';
import type { RequestContext } from '../context.js';
import type { CommentRecord, CommunityRepository } from './communityRepository.js';

/** CO-04 — comenta num post (até 1.000 caracteres). Cliente ou equipe (como a marca). */

export interface CommentOnPostDeps {
  readonly community: CommunityRepository;
}

export interface CommentOnPostCommand {
  readonly postId: string;
  readonly body: string;
}

export async function commentOnPost(
  deps: CommentOnPostDeps,
  ctx: RequestContext,
  command: CommentOnPostCommand,
): Promise<CommentRecord> {
  const authorCustomerId = communityAuthorCustomerId(ctx);
  validateComment(command.body);
  // CO-08: post fora do ar (ou de outro tenant) não recebe comentário.
  await requireOpenPost(deps.community, ctx, command.postId);
  return deps.community.addComment({
    tenantId: ctx.tenantId,
    postId: command.postId,
    authorCustomerId,
    body: command.body,
  });
}

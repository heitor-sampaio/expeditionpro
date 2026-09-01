import { BusinessRuleError } from '../errors.js';
import { requireCustomer } from './createPost.js';
import type { RequestContext } from '../context.js';
import type { CommunityRepository } from './communityRepository.js';

/**
 * CO-08 — denúncia de post ou comentário por qualquer cliente autenticado, gerando entrada
 * em `post_reports` (status `open`). A moderação é reativa: a equipe resolve depois.
 */

export interface ReportContentDeps {
  readonly community: CommunityRepository;
}

export interface ReportContentCommand {
  readonly postId?: string | null;
  readonly commentId?: string | null;
  readonly reason: string;
}

export async function reportContent(
  deps: ReportContentDeps,
  ctx: RequestContext,
  command: ReportContentCommand,
): Promise<void> {
  const customerId = requireCustomer(ctx);
  const postId = command.postId ?? null;
  const commentId = command.commentId ?? null;
  if (postId === null && commentId === null) {
    throw new BusinessRuleError('nothing_reported', 'Denúncia precisa de um post ou comentário');
  }
  await deps.community.addReport({
    tenantId: ctx.tenantId,
    postId,
    commentId,
    reporterCustomerId: customerId,
    reason: command.reason,
  });
}

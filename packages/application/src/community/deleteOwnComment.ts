import { ForbiddenError, NotFoundError } from '../errors.js';
import { requireCustomer } from '../audience.js';
import type { RequestContext } from '../context.js';
import type { CommunityRepository } from './communityRepository.js';

/**
 * CO-10 — o autor apaga o próprio comentário. Espelha o `deleteOwnPost`: só o dono, e a
 * equipe usa a moderação, não isto. Exclusão lógica — conversa apagada continua na tabela,
 * porque denúncia e moderação precisam do que foi dito, não do que sobrou.
 *
 * Comentário oficial da marca (`authorCustomerId` nulo) não tem dono cliente, então nunca
 * é apagável por aqui.
 */

export interface DeleteOwnCommentDeps {
  readonly community: CommunityRepository;
}

export async function deleteOwnComment(
  deps: DeleteOwnCommentDeps,
  ctx: RequestContext,
  commentId: string,
): Promise<void> {
  const customerId = requireCustomer(ctx);
  const comment = await deps.community.findComment(ctx.tenantId, commentId);
  if (!comment) throw new NotFoundError('comentário');
  if (comment.authorCustomerId !== customerId) {
    throw new ForbiddenError('Só o autor apaga o próprio comentário');
  }
  await deps.community.deleteComment(ctx.tenantId, commentId);
}

import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CommunityRepository, ReportQueueItem } from './communityRepository.js';

/** CO-08 — fila de denúncias abertas para a equipe revisar. Só a equipe. */

export interface GetModerationQueueDeps {
  readonly community: CommunityRepository;
}

export async function getModerationQueue(
  deps: GetModerationQueueDeps,
  ctx: RequestContext,
): Promise<ReportQueueItem[]> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('Fila de denúncias é da equipe');
  }
  return deps.community.listOpenReports(ctx.tenantId);
}

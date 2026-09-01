import { requireWriter } from '../audience.js';
import { BusinessRuleError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CommunityRepository } from './communityRepository.js';

/**
 * CO-08 — moderação reativa: a equipe oculta (`flagged`), remove (`removed`) ou restaura
 * (`published`) um post, com motivo. Só a equipe modera; o motivo é obrigatório para tirar do ar.
 */

export interface ModeratePostDeps {
  readonly community: CommunityRepository;
}

export type ModerationAction = 'hide' | 'remove' | 'restore';

export interface ModeratePostCommand {
  readonly postId: string;
  readonly action: ModerationAction;
  readonly reason: string;
}

const STATUS: Record<ModerationAction, string> = {
  hide: 'flagged',
  remove: 'removed',
  restore: 'published',
};

export async function moderatePost(
  deps: ModeratePostDeps,
  ctx: RequestContext,
  command: ModeratePostCommand,
): Promise<void> {
  requireWriter(ctx);
  if (command.action !== 'restore' && command.reason.trim() === '') {
    throw new BusinessRuleError('reason_required', 'Tirar do ar exige motivo');
  }
  await deps.community.setPostStatus(
    ctx.tenantId,
    command.postId,
    STATUS[command.action],
    command.reason,
  );
}

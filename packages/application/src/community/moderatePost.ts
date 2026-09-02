import { requireWriter } from '../audience.js';
import { actorUserId, type AuditLogRepository } from '../audit/auditLogRepository.js';
import { BusinessRuleError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CommunityRepository } from './communityRepository.js';

/**
 * CO-08 — moderação reativa: a equipe oculta (`flagged`), remove (`removed`) ou restaura
 * (`published`) um post, com motivo. Só a equipe modera; o motivo é obrigatório para tirar do ar.
 */

export interface ModeratePostDeps {
  readonly community: CommunityRepository;
  readonly audit: AuditLogRepository;
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

  /*
   * A09 — tirar do ar o post de um cliente é decisão de autoridade sobre a fala de outra
   * pessoa, e até aqui só o **motivo** ficava guardado, na própria linha do post: quem
   * decidiu, não. `resolveReport` já grava o decisor na denúncia; a moderação do conteúdo
   * é caminho separado (a equipe decide caso a caso) e não tinha o equivalente.
   *
   * Depois da escrita, de propósito: moderação recusada por falta de motivo não aconteceu,
   * e não vira linha.
   */
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'community_post',
    entityId: command.postId,
    action: 'community_post.moderate',
    diff: { action: command.action, status: STATUS[command.action], reason: command.reason },
  });
}

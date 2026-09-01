import { requireWriter } from '../audience.js';
import type { RequestContext } from '../context.js';
import type { CommunityRepository, ReportDecision } from './communityRepository.js';

/**
 * CO-08 — encerra uma denúncia: `resolved` (providência tomada) ou `dismissed` (sem
 * mérito), gravando quem decidiu. Só a equipe. A ação no conteúdo (ocultar/remover) é
 * separada — `moderatePost` — para a equipe decidir caso a caso.
 */

export interface ResolveReportDeps {
  readonly community: CommunityRepository;
}

export interface ResolveReportCommand {
  readonly reportId: string;
  readonly decision: ReportDecision;
}

export async function resolveReport(
  deps: ResolveReportDeps,
  ctx: RequestContext,
  command: ResolveReportCommand,
): Promise<void> {
  requireWriter(ctx);
  await deps.community.resolveReport(
    ctx.tenantId,
    command.reportId,
    command.decision,
    ctx.actor.userId,
  );
}

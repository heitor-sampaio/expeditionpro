import { UnauthorizedError } from '@expedition/application';
import type { MembershipRepository, RequestContext } from '@expedition/application';
import type { FastifyRequest } from 'fastify';

export interface MembershipCheckDeps {
  readonly memberships: MembershipRepository;
}

/**
 * SEC-17 — o token prova **quem** é a pessoa; o banco decide **o que** ela pode.
 *
 * O papel vinha inteiro do `app_metadata` do token, e um token do Supabase vale cerca de
 * uma hora. Tirar alguém da equipe não tinha efeito nenhum até esse prazo passar — e uma
 * hora é tempo de sobra para apagar uma saída inteira. Com a linha de acesso consultada
 * aqui, o corte vale na requisição seguinte.
 *
 * O papel vem do banco mesmo quando existe acesso: rebaixar alguém de admin para viewer
 * passa a valer no ato, sem esperar novo login. O token continua provando a identidade,
 * que é o que ele sabe fazer e o banco não.
 *
 * Custo: uma consulta por requisição de equipe, resolvida pelo índice único
 * `(tenant_id, user_id)`. Cliente, integração e sistema não passam por aqui — não são
 * membros de equipe, e o escopo deles já vem do próprio token.
 *
 * Sem linha de acesso responde **401**, não 403: 403 confirmaria que a conta existe e
 * que o tenant é aquele.
 */
export function withMembershipCheck(
  resolve: (request: FastifyRequest) => Promise<RequestContext>,
  deps: MembershipCheckDeps,
): (request: FastifyRequest) => Promise<RequestContext> {
  return async (request: FastifyRequest): Promise<RequestContext> => {
    const ctx = await resolve(request);
    if (ctx.actor.kind !== 'team') return ctx;

    const acesso = await deps.memberships.findByUser(ctx.tenantId, ctx.actor.userId);
    if (!acesso) throw new UnauthorizedError('sem acesso a este tenant');

    return { ...ctx, actor: { ...ctx.actor, role: acesso.role } };
  };
}

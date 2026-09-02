import { ForbiddenError } from '../errors.js';
import type { RequestContext, TeamRole } from '../context.js';

type TeamActor = Extract<RequestContext['actor'], { kind: 'team' }>;

/**
 * SEC-17/18 — administrar a equipe é de owner ou admin. Assertion function para o chamador
 * continuar com o ator estreitado, como o resto das guardas do projeto.
 */
export function requireTeamAdmin(
  ctx: RequestContext,
  acao: string,
): asserts ctx is RequestContext & {
  actor: TeamActor;
} {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError(`${acao} exige owner ou admin`);
  }
}

/**
 * SEC-18 — o dono não é mexido por quem ele nomeou.
 *
 * Buraco encontrado ao revisar o SEC-17 recém-entregue: administrar equipe era owner **ou**
 * admin sem distinção, então um admin podia tirar o acesso do dono. O tenant ficaria sem
 * dono e quem nomeou o admin perderia o sistema — escalada de privilégio num clique.
 *
 * Promover a owner cai na mesma regra: é transferência de dono, não administração de
 * equipe. Quem já é owner pode fazer as duas coisas, e é o que dá saída para o dono que
 * vai embora — ele promove alguém antes.
 *
 * A regra vive aqui, e não copiada em cada caso de uso, porque é sutil o bastante para
 * divergir na segunda cópia.
 */
export function assertOwnerReach(actor: TeamActor, alvoAtual: TeamRole, alvoNovo?: TeamRole): void {
  if (actor.role === 'owner') return;
  if (alvoAtual === 'owner' || alvoNovo === 'owner') {
    throw new ForbiddenError('Somente o owner mexe no papel ou no acesso de um owner');
  }
}

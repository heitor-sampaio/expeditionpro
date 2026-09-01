import { ForbiddenError } from './errors.js';
import type { RequestContext } from './context.js';

/**
 * SEC-01 — as guardas de audiência, num lugar só.
 *
 * O servidor fala com o banco por um role com `BYPASSRLS`: a policy do Postgres **não
 * protege esta via**, e a Client Extension injeta `tenantId` e mais nada. Audiência é
 * responsabilidade do caso de uso, sempre.
 *
 * Estavam espalhadas em três pastas — uma em `communications`, uma em `community`, uma em
 * `itineraries` —, e esse era o próprio defeito: quem escrevia caso de uso novo não achava
 * a guarda, então não punha nenhuma. Duas famílias inteiras (fornecedores, roteiros) foram
 * entregues sem guarda por isso.
 *
 * A regra do produto, decidida pelo dono:
 *
 * | O cliente pode | O cliente não pode |
 * |---|---|
 * | ver a agenda (só ver) | procurar, criar, editar ou apagar outro cliente |
 * | ver as expedições ativas | criar, editar ou apagar roteiro |
 * | se inscrever numa expedição | qualquer tipo de lançamento |
 * | postar, curtir e comentar | apagar post, comentário ou curtida de outro |
 * | editar os próprios dados | mexer em dado de outra família |
 */

/** Escrita de back-office e leitura de dado consolidado: só equipe. */
export function requireTeam(ctx: RequestContext): void {
  if (ctx.actor.kind !== 'team') throw new ForbiddenError('somente equipe');
}

/**
 * O próprio cliente, ou a equipe agindo por ele. `integration` e `system` passam de
 * propósito — webhook e job interno agem por conta do tenant, não de uma pessoa. Só o
 * cliente é barrado ao mirar outro cliente.
 */
export function requireSelfOrTeam(ctx: RequestContext, customerId: string): void {
  if (ctx.actor.kind === 'customer' && ctx.actor.customerId !== customerId) {
    throw new ForbiddenError('Cliente só age sobre os próprios dados');
  }
}

/**
 * Barra o cliente e deixa passar equipe, `integration` e `system`. É a guarda certa para
 * operação de back-office que um webhook ou job também dispara — `requireTeam` ali
 * quebraria a integração sem que nada na tela dissesse por quê.
 */
export function denyCustomer(ctx: RequestContext): void {
  if (ctx.actor.kind === 'customer') throw new ForbiddenError('somente equipe');
}

/** Ação que só existe para cliente logado (comunidade). Devolve o id dele. */
export function requireCustomer(ctx: RequestContext): string {
  if (ctx.actor.kind !== 'customer') throw new ForbiddenError('somente cliente');
  return ctx.actor.customerId;
}

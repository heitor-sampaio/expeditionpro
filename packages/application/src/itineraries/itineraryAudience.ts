import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { ItineraryDeps } from './priceInput.js';
import type { ItineraryRecord } from './itineraryRepository.js';

/**
 * SEC-01 — quem enxerga o quê no catálogo de roteiros.
 *
 * O servidor fala com o banco por um role com `BYPASSRLS`: a policy do Postgres **não
 * protege esta via**. A Client Extension injeta `tenantId` e mais nada — audiência é
 * responsabilidade do caso de uso. Por isso a guarda mora aqui, e não na rota: rota nova
 * que esqueça de chamar o caso de uso é erro visível; caso de uso sem guarda é silencioso.
 */

/** A vitrine (RO-07): ativo e de catálogo. `custom` é saída fechada e fica fora (§3.5.1). */
export function isShowcase(itinerary: ItineraryRecord): boolean {
  return itinerary.status === 'active' && itinerary.kind === 'catalog';
}

/** Escrita e dado interno de reajuste: equipe. */
export function requireTeam(ctx: RequestContext): void {
  if (ctx.actor.kind !== 'team') throw new ForbiddenError('somente equipe');
}

/**
 * Leitura de um roteiro específico. Fora da vitrine, o cliente recebe **`NotFoundError`**:
 * `403` diria "existe, mas não é seu", e o roteiro personalizado é justamente a saída que
 * ninguém de fora deve saber que existe (CLAUDE.md).
 */
export async function readableItinerary(
  deps: ItineraryDeps,
  ctx: RequestContext,
  itineraryId: string,
): Promise<ItineraryRecord> {
  const itinerary = await deps.itineraries.findById(ctx.tenantId, itineraryId);
  if (!itinerary) throw new NotFoundError('roteiro');
  if (ctx.actor.kind !== 'team' && !isShowcase(itinerary)) throw new NotFoundError('roteiro');
  return itinerary;
}

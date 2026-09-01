import { isShowcase } from './itineraryAudience.js';
import type { RequestContext } from '../context.js';
import type { ItineraryDeps } from './priceInput.js';
import type { ItineraryRecord } from './itineraryRepository.js';

/**
 * RO-01 · RO-07 — o catálogo, na medida de quem pergunta. A equipe vê tudo (rascunho,
 * arquivado, personalizado); o cliente vê só a vitrine.
 *
 * A rota lia o repositório direto e devolvia a lista inteira, com o portal filtrando no
 * navegador. Filtro de audiência no cliente não é filtro: o dado já saiu.
 */
export async function listItineraries(
  deps: ItineraryDeps,
  ctx: RequestContext,
): Promise<ItineraryRecord[]> {
  const todos = await deps.itineraries.list(ctx.tenantId);
  if (ctx.actor.kind === 'team') return todos;
  return todos.filter(isShowcase);
}

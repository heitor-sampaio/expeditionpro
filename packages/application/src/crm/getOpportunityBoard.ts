import { requireTeam } from '../audience.js';
import type { RequestContext } from '../context.js';
import type {
  OpportunityRecord,
  OpportunityRepository,
  OpportunityStageRecord,
} from './opportunityRepository.js';

export interface BoardDeps {
  readonly opportunities: OpportunityRepository;
}

export interface BoardColumn {
  readonly stage: OpportunityStageRecord;
  readonly opportunities: readonly OpportunityRecord[];
  /**
   * OP-09 — soma do **previsto** desta coluna, em centavos.
   *
   * É previsão, não caixa. Nunca some isto a valor recebido, contratado ou em aberto (§3.6):
   * o ledger registra o que aconteceu, e este número é uma aposta sobre o que talvez aconteça.
   * A tela é obrigada a rotulá-lo como previsto.
   */
  readonly expectedValueCents: number;
}

/**
 * OP-09 · OP-11 — o quadro: etapas na ordem do funil, cada uma com seus cartões.
 *
 * `viewer` lê (é somente leitura, não cego); cliente não chega aqui — o funil é só da equipe,
 * e ele nem sabe que existe.
 *
 * Devolve etapa por etapa em vez de uma lista plana porque coluna vazia **precisa** aparecer:
 * um funil em que "Proposta enviada" está vazia está dizendo algo, e uma lista plana esconderia
 * exatamente isso.
 */
export async function getOpportunityBoard(
  deps: BoardDeps,
  ctx: RequestContext,
): Promise<BoardColumn[]> {
  requireTeam(ctx);

  const [etapas, cartoes] = await Promise.all([
    deps.opportunities.listStages(ctx.tenantId),
    deps.opportunities.listOpportunities(ctx.tenantId),
  ]);

  return etapas.map((stage) => {
    const daEtapa = cartoes.filter((o) => o.stageId === stage.id);
    return {
      stage,
      opportunities: daEtapa,
      expectedValueCents: daEtapa.reduce(
        (total, o) => total + Number(o.expectedValueCents ?? 0),
        0,
      ),
    };
  });
}

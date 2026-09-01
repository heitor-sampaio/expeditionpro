import { bandLabel, familyBudget, type AgeBandsInput, type BudgetMember } from './familyBudget.js';
import { formatCents } from './format.js';
import type { PriceTableDto } from '../itineraries/useItineraryPrices.js';

/**
 * O que a família pagaria nesta saída (§3.4): uma linha por pessoa com a faixa etária
 * resolvida na data da saída e o total pela regra casal/solo + adicionais.
 *
 * É estimativa com a família **de hoje** — quem vai é escolhido na inscrição, e o valor
 * definitivo só é congelado na alocação. A tela diz as duas coisas.
 */
export function FamilyBudgetCard({
  members,
  prices,
  startDateIso,
  bands,
  hasGroup,
}: {
  readonly members: readonly BudgetMember[];
  readonly prices: PriceTableDto;
  readonly startDateIso: string;
  readonly bands: AgeBandsInput;
  /** Sem grupo marcado, a idade é calculada para hoje — e isso precisa ficar dito. */
  readonly hasGroup: boolean;
}): React.JSX.Element | null {
  if (members.length === 0) return null;

  const budget = familyBudget(members, prices, startDateIso, bands);

  return (
    <div className="card budget-card">
      <div className="panel-head">
        <h3 className="card-title">Sua família nesta expedição</h3>
      </div>

      <div className="budget-lines">
        {budget.lines.map((line) => (
          <div key={line.id} className="budget-line">
            <span className="budget-name">{line.fullName}</span>
            <span className="budget-band">{bandLabel(line.band, bands)}</span>
          </div>
        ))}
      </div>

      <div className="budget-total">
        <span className="stat-label">Total estimado</span>
        <span className="stat-num">
          <span className="stat-unit">R$</span>
          {formatCents(budget.totalCents)}
        </span>
      </div>

      <p className="field-help">
        {hasGroup
          ? 'Estimativa para a próxima saída, com as idades na data da viagem. '
          : 'Estimativa com as idades de hoje — sem saída marcada, a data ainda não conta. '}
        Você escolhe quem vai na hora de se inscrever, e o valor é fechado na confirmação.
      </p>
    </div>
  );
}

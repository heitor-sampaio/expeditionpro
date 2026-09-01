import { useItineraryPrices } from './useItineraryPrices.js';

/**
 * Valores do roteiro na vitrine (§3.4). As cinco categorias não são do mesmo tipo e a tela
 * precisa dizer isso: **casal e solo são a base da inscrição** (casal cobre duas pessoas,
 * solo cobre uma), e adulto adicional / crianças são **por pessoa**, somados à base. Quem
 * lê "casal R$ 2.000" sem essa distinção multiplica por dois e erra.
 *
 * As faixas etárias vêm do próprio roteiro, então os rótulos mostram os anos configurados.
 * Cinco blocos na mesma faixa — o padrão de estatísticas do design system.
 */
export function ItineraryPrices({
  itineraryId,
  childYoungMaxAge,
  childMidMaxAge,
}: {
  readonly itineraryId: string;
  readonly childYoungMaxAge: number;
  readonly childMidMaxAge: number;
}): React.JSX.Element {
  const state = useItineraryPrices(itineraryId);

  if (state.status === 'loading') {
    return (
      <div className="skeleton" aria-hidden>
        <div className="skel-card">
          <div className="skel-bars">
            <div className="skel-bar" />
            <div className="skel-bar short" />
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'none') {
    return (
      <div className="state" role="status">
        <div className="state-text">
          <span className="state-title">Valores sob consulta</span>
          <span className="state-line">Fale com a equipe para o valor desta expedição.</span>
        </div>
      </div>
    );
  }

  const { prices } = state;
  const rows = [
    { label: 'Casal', hint: 'base, duas pessoas', cents: prices.coupleCents },
    { label: 'Solo', hint: 'base, uma pessoa', cents: prices.soloCents },
    {
      label: 'Adulto adicional',
      hint: `a partir do 3º adulto · ${childMidMaxAge + 1}+ anos`,
      cents: prices.extraAdultCents,
    },
    {
      label: 'Criança',
      hint: `${childYoungMaxAge + 1} a ${childMidMaxAge} anos · por criança`,
      cents: prices.childMidCents,
    },
    {
      label: 'Criança',
      hint: `até ${childYoungMaxAge} anos · por criança`,
      cents: prices.childYoungCents,
    },
  ];

  return (
    <div className="stats price-stats">
      {rows.map((row) => (
        <div key={`${row.label}-${row.hint}`} className="stat">
          {/* Zero é cortesia, não preço: "R$ 0,00" faz o leitor procurar a pegadinha. */}
          {row.cents === 0 ? (
            <span className="stat-num">cortesia</span>
          ) : (
            <span className="stat-num">
              <span className="stat-unit">R$</span>
              {brl(row.cents)}
            </span>
          )}
          <span className="stat-label">{row.label}</span>
          <span className="stat-context">{row.hint}</span>
        </div>
      ))}
    </div>
  );
}

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

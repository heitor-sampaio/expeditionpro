import { brl } from '../ui/money.js';
import { useExpensesByCategory } from './useExpensesByCategory.js';
import type { ReportFilter } from './useFinancialReport.js';

/**
 * FO-06 — para onde o dinheiro vai, por tipo de serviço.
 *
 * Recebe o **mesmo filtro** do fechamento logo acima, e é o que faz a coluna Gastos dos
 * dois bater. Se um dia divergirem, um dos dois está errado — e essa comparação, feita a
 * olho na mesma página, é a checagem mais barata que existe.
 *
 * Sem cor: gasto por categoria não é estado financeiro. Verde e vermelho ficam com pago e
 * cancelado, como manda o design system (§1).
 */
export function ExpensesByCategorySection({ filter }: { filter: ReportFilter }): React.JSX.Element {
  const { state, refresh } = useExpensesByCategory(filter);

  return (
    <section className="card">
      <div className="panel-head">
        <h2 className="card-title">Gastos por categoria</h2>
      </div>

      {state.status === 'loading' && (
        <div className="skel-bars" aria-busy="true">
          <span className="skel-bar" />
          <span className="skel-bar" />
          <span className="skel-bar" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar os gastos por categoria</span>
            <span className="state-line is-error">Tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' && state.report.rows.length === 0 && (
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">Nenhum gasto no período</span>
            <span className="state-line">
              Gastos lançados nas saídas aparecem aqui, agrupados pela categoria do fornecedor.
            </span>
          </div>
        </div>
      )}

      {state.status === 'ready' && state.report.rows.length > 0 && (
        <div className="tbl-wrap">
          <div className="tbl tbl-expcat">
            <div className="tbl-row tbl-head">
              <span>Categoria</span>
              <span className="col-num">Contratado</span>
              <span className="col-num">Pago</span>
              <span className="col-num">Em aberto</span>
              <span className="col-num">Fornecedores</span>
            </div>

            {state.report.rows.map((row) => (
              <div key={row.categoryId ?? 'sem-categoria'} className="tbl-row">
                <span>
                  {row.categoryId === null ? (
                    /* Cinza: é lembrete de cadastro por fazer, não uma categoria. */
                    <span className="cell-contact">{row.categoryName}</span>
                  ) : (
                    <span className="pill pill-neutral">{row.categoryName}</span>
                  )}
                </span>
                <span className="col-num mono">{brl(row.contractedCents)}</span>
                <span className="col-num mono">{brl(row.paidCents)}</span>
                <span className="col-num mono">{brl(row.outstandingCents)}</span>
                <span className="col-num mono">{row.supplierCount}</span>
              </div>
            ))}

            <div className="tbl-row tbl-foot">
              <span>Total</span>
              <span className="col-num mono">{brl(state.report.totals.contractedCents)}</span>
              <span className="col-num mono">{brl(state.report.totals.paidCents)}</span>
              <span className="col-num mono">{brl(state.report.totals.outstandingCents)}</span>
              <span className="col-num mono">—</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

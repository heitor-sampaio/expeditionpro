import { useState } from 'react';
import {
  useFinancialReport,
  type FinancialReport,
  type ReportFilter,
  type ReportRow,
} from './useFinancialReport.js';
import { brl } from '../ui/money.js';
import { ChargesPanel } from './ChargesPanel.js';
import { ExpensesByCategorySection } from './ExpensesByCategorySection.js';
import { useItineraries } from '../agenda/useItineraries.js';

/**
 * Relatórios — fechamento por saída, consolidado (estende GR-10). Filtro por período e
 * roteiro + faixa de estatísticas do tenant + tabela de saídas com rodapé de totais. Cor
 * é dado: margem verde/vermelho pelo sinal, a receber em accent. Só a equipe.
 */
export function RelatoriosScreen(): React.JSX.Element {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [itineraryId, setItineraryId] = useState('');
  const filter: ReportFilter = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(itineraryId ? { itineraryId } : {}),
  };
  const { state, refresh } = useFinancialReport(filter);
  const itineraries = useItineraries(true);
  const hasFilter = from !== '' || to !== '' || itineraryId !== '';
  const clear = () => {
    setFrom('');
    setTo('');
    setItineraryId('');
  };

  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1 className="page-title">Relatórios</h1>
        <p className="page-meta">Fechamento por saída — receita, gastos e margem, sem planilha.</p>
      </div>

      <section className="card report-filters">
        <label className="field">
          <span className="field-label">De</span>
          <input
            type="date"
            className="field-input is-mono"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Até</span>
          <input
            type="date"
            className="field-input is-mono"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="field field-wide">
          <span className="field-label">Roteiro</span>
          <select
            className="field-input"
            value={itineraryId}
            onChange={(e) => setItineraryId(e.target.value)}
          >
            <option value="">Todos os roteiros</option>
            {itineraries.status === 'ready' &&
              itineraries.itineraries.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
          </select>
        </label>
        {hasFilter && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={clear}>
            Limpar filtros
          </button>
        )}
      </section>

      {state.status === 'loading' && (
        <section className="card" aria-busy>
          <div className="skel-bars">
            <div className="skel-bar" />
            <div className="skel-bar short" />
            <div className="skel-bar" />
          </div>
        </section>
      )}

      {state.status === 'error' && (
        <section className="card">
          <div className="state" role="alert">
            <div className="state-text">
              <span className="state-title">Não deu para carregar o relatório</span>
              <span className="state-line is-error">Tente de novo.</span>
            </div>
            <div className="state-grow" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
              Tentar de novo
            </button>
          </div>
        </section>
      )}

      {state.status === 'ready' && state.report.rows.length === 0 && (
        <section className="card">
          <div className="state" role="status">
            <div className="state-text">
              <span className="state-title">
                {hasFilter ? 'Nenhuma saída no filtro' : 'Nenhuma saída ainda'}
              </span>
              <span className="state-line">
                {hasFilter
                  ? 'Ajuste o período ou o roteiro para ver o fechamento.'
                  : 'Monte uma saída na agenda para ver o fechamento aqui.'}
              </span>
            </div>
            {hasFilter && (
              <>
                <div className="state-grow" />
                <button type="button" className="btn btn-secondary btn-sm" onClick={clear}>
                  Limpar filtros
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {state.status === 'ready' && state.report.rows.length > 0 && <Report report={state.report} />}

      {/* Mesmo filtro do fechamento acima: a coluna Gastos dos dois tem que bater. */}
      <ExpensesByCategorySection filter={filter} />

      <ChargesPanel />
    </main>
  );
}

function Report({ report }: { report: FinancialReport }): React.JSX.Element {
  const t = report.totals;
  const marginClass = t.grossMarginCents < 0 ? ' is-no' : ' is-go';
  return (
    <>
      <div className="stats">
        <Stat value={t.revenueCents} label="Receita" context="contratado confirmado" />
        <Stat value={t.expenseCents} label="Gastos" context="com fornecedores" />
        <Stat
          value={t.grossMarginCents}
          label="Margem bruta"
          context={t.marginPercent === null ? 'sem receita' : `${t.marginPercent}% da receita`}
          numClass={marginClass}
        />
        <Stat value={t.dueCents} label="A receber" context="do que está confirmado" />
      </div>

      <section className="card">
        <div className="tbl-wrap">
          <div className="tbl tbl-report">
            <div className="tbl-row tbl-head">
              <span>Saída</span>
              <span className="col-num">Receita</span>
              <span className="col-num">Gastos</span>
              <span className="col-num">Margem</span>
              <span className="col-num">A receber</span>
            </div>
            {report.rows.map((row) => (
              <Row key={row.groupId} row={row} />
            ))}
            <div className="tbl-row tbl-foot">
              <span>Totais</span>
              <span className="col-num mono">{brl(t.revenueCents)}</span>
              <span className="col-num mono">{brl(t.expenseCents)}</span>
              <span className={`col-num mono${t.grossMarginCents < 0 ? ' is-no' : ' is-go'}`}>
                {brl(t.grossMarginCents)}
              </span>
              <span className="col-num mono accent">{brl(t.dueCents)}</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Row({ row }: { row: ReportRow }): React.JSX.Element {
  const marginClass = row.grossMarginCents < 0 ? ' is-no' : ' is-go';
  return (
    <div className={`tbl-row${row.status === 'cancelled' ? ' is-cancelled' : ''}`}>
      <span className="cell-name">
        {row.groupName}
        <span className="cell-sub mono">
          {row.startDate} → {row.endDate}
        </span>
      </span>
      <span className="col-num mono">{brl(row.revenueCents)}</span>
      <span className="col-num mono">{brl(row.expenseCents)}</span>
      <span className={`col-num mono${marginClass}`}>
        {brl(row.grossMarginCents)}
        {row.marginPercent !== null && <span className="cell-sub mono"> {row.marginPercent}%</span>}
      </span>
      <span className="col-num mono accent">{brl(row.dueCents)}</span>
    </div>
  );
}

function Stat({
  value,
  label,
  context,
  numClass = '',
}: {
  value: number;
  label: string;
  context: string;
  numClass?: string;
}): React.JSX.Element {
  return (
    <div className="stat">
      <span className={`stat-num${numClass}`}>
        <span className="stat-unit">R$</span>
        {brl(value)}
      </span>
      <span className="stat-label">{label}</span>
      <span className="stat-context">{context}</span>
    </div>
  );
}

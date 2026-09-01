import { useDashboard, type Dashboard, type UpcomingGroupDto } from './useDashboard.js';

/**
 * Visão geral (dashboard operacional). Faixa de estatísticas do tenant — confirmado ×
 * projetado, a receber, pendências — e as próximas saídas. Cor é dado: a receber em accent,
 * pendências em cinza (não é alarme, é fila). Clicar numa saída abre a mesa do grupo.
 */
export function DashboardScreen({
  onOpenGroup,
}: {
  onOpenGroup: (groupId: string) => void;
}): React.JSX.Element {
  const { state, refresh } = useDashboard();

  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1 className="page-title">Visão geral</h1>
        <p className="page-meta">Confirmado × projetado, a receber e as próximas saídas.</p>
      </div>

      {state.status === 'loading' && (
        <section className="card" aria-busy>
          <div className="skel-bars">
            <div className="skel-bar" />
            <div className="skel-bar short" />
          </div>
        </section>
      )}

      {state.status === 'error' && (
        <section className="card">
          <div className="state" role="alert">
            <div className="state-text">
              <span className="state-title">Não deu para carregar a visão geral</span>
              <span className="state-line is-error">Tente de novo.</span>
            </div>
            <div className="state-grow" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
              Tentar de novo
            </button>
          </div>
        </section>
      )}

      {state.status === 'ready' && (
        <Overview dashboard={state.dashboard} onOpenGroup={onOpenGroup} />
      )}
    </main>
  );
}

function Overview({
  dashboard,
  onOpenGroup,
}: {
  dashboard: Dashboard;
  onOpenGroup: (groupId: string) => void;
}): React.JSX.Element {
  return (
    <>
      <div className="stats">
        <MoneyStat
          value={dashboard.confirmedRevenueCents}
          label="Confirmado"
          context="receita de inscrições confirmadas"
        />
        <MoneyStat
          value={dashboard.projectedRevenueCents}
          label="Projetado"
          context="confirmado + pendente"
        />
        <MoneyStat
          value={dashboard.dueCents}
          label="A receber"
          context="do que está confirmado"
          numClass=" accent"
        />
        <div className="stat">
          <span className="stat-num">
            {dashboard.pendingIntakeCount + dashboard.pendingBookingCount}
          </span>
          <span className="stat-label">Pendências</span>
          <span className="stat-context">
            {dashboard.pendingIntakeCount} na fila · {dashboard.pendingBookingCount} inscrições
          </span>
        </div>
      </div>

      <section className="card">
        <div className="panel-head">
          <h2 className="card-title">Próximas saídas</h2>
        </div>
        {dashboard.upcoming.length === 0 ? (
          <p className="members-empty">Nenhuma saída futura agendada.</p>
        ) : (
          <div className="tbl-wrap">
            <div className="tbl tbl-upcoming">
              <div className="tbl-row tbl-head">
                <span>Saída</span>
                <span>Datas</span>
                <span className="col-num">Confirmadas</span>
                <span className="col-num">Pendentes</span>
                <span className="col-num">Vagas</span>
              </div>
              {dashboard.upcoming.map((u) => (
                <UpcomingRow key={u.groupId} row={u} onOpen={() => onOpenGroup(u.groupId)} />
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function UpcomingRow({
  row,
  onOpen,
}: {
  row: UpcomingGroupDto;
  onOpen: () => void;
}): React.JSX.Element {
  return (
    <div
      className="tbl-row tbl-row-click"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="cell-name">{row.groupName}</span>
      <span className="mono">
        {row.startDate} → {row.endDate}
      </span>
      <span className="col-num mono">{row.confirmedCount}</span>
      <span className="col-num mono">{row.pendingCount}</span>
      <span className="col-num mono">
        {row.capacityVehicles === null ? '—' : row.capacityVehicles}
      </span>
    </div>
  );
}

function MoneyStat({
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

function brl(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const cent = String(abs % 100).padStart(2, '0');
  const grouped = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped},${cent}`;
}

import { useMemo, useState } from 'react';
import {
  buildMonth,
  CalendarSkeleton,
  MonthGrid,
  periodLabel,
  startOfDay,
  toIso,
  type CalendarEvent,
} from '../agenda/calendar.js';
import { useItinerariesAdmin } from '../itineraries/useItinerariesAdmin.js';
import { usePortalExpeditions } from './usePortalBrowse.js';

/**
 * Agenda do cliente (AG-01): o mesmo calendário do back-office, sem nenhum controle de
 * edição — o cliente não cria, não edita e não abre a mesa do grupo. Clicar numa data
 * abre a página do roteiro.
 *
 * A fonte é a **vitrine** (`/v1/portal/expeditions`, saídas abertas e públicas), não a
 * agenda interna: grupo privado fica fora do portal (AG-07) e ocupação é dado de operação.
 */
export function PortalAgendaScreen({
  onOpenItinerary,
}: {
  readonly onOpenItinerary: (itineraryId: string) => void;
}): React.JSX.Element {
  const { state, refresh } = usePortalExpeditions();
  const catalog = useItinerariesAdmin();
  const today = new Date();
  const [anchor, setAnchor] = useState(startOfDay(today));
  const [itineraryFilter, setItineraryFilter] = useState('all');

  const all = state.status === 'ready' ? state.expeditions : [];
  const events = useMemo(
    () =>
      all
        .filter((e) => itineraryFilter === 'all' || e.itineraryId === itineraryFilter)
        .map((e): CalendarEvent => ({
          id: e.groupId,
          itineraryId: e.itineraryId,
          startDate: e.startDate,
          endDate: e.endDate,
          name: e.itineraryName,
          sub: '',
        })),
    [all, itineraryFilter],
  );

  const shift = (delta: number) =>
    setAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  const filtersActive = itineraryFilter !== 'all';

  return (
    <div className="page page-wide">
      <div className="page-header agenda-header">
        <div>
          <h1 className="page-title">Agenda</h1>
          <p className="page-meta">As saídas abertas. Clique numa data para ver o roteiro.</p>
        </div>
      </div>

      <div className="cal-toolbar">
        <div className="cal-nav">
          <button
            type="button"
            className="icon-btn"
            aria-label="anterior"
            onClick={() => shift(-1)}
          >
            ‹
          </button>
          <span className="cal-month">{periodLabel('month', anchor)}</span>
          <button type="button" className="icon-btn" aria-label="próximo" onClick={() => shift(1)}>
            ›
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setAnchor(startOfDay(today))}
          >
            Hoje
          </button>
        </div>
        <div className="cal-filter-group">
          <select
            className="field-input cal-filter-select"
            aria-label="Filtrar por roteiro"
            value={itineraryFilter}
            onChange={(e) => setItineraryFilter(e.target.value)}
          >
            <option value="all">Todos os roteiros</option>
            {catalog.state.status === 'ready' &&
              catalog.state.itineraries.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
          </select>
          {filtersActive && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setItineraryFilter('all')}
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {state.status === 'loading' && <CalendarSkeleton />}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar a agenda</span>
            <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' && all.length === 0 && (
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">Nenhuma saída aberta agora</span>
            <span className="state-line">Volte em breve — novas expedições aparecem aqui.</span>
          </div>
        </div>
      )}

      {state.status === 'ready' && all.length > 0 && events.length === 0 && (
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">Nenhuma saída com esse filtro</span>
            <span className="state-line">Ajuste o roteiro para ver mais.</span>
          </div>
          <div className="state-grow" />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setItineraryFilter('all')}
          >
            Limpar filtros
          </button>
        </div>
      )}

      {state.status === 'ready' && events.length > 0 && (
        <MonthGrid
          weeks={buildMonth(anchor.getFullYear(), anchor.getMonth())}
          events={events}
          today={toIso(today)}
          onOpen={(ev) => onOpenItinerary(ev.itineraryId)}
        />
      )}
    </div>
  );
}

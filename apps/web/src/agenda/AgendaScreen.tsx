import { useMemo, useState } from 'react';
import { useScheduleEvents, type ScheduleEventDto } from './useScheduleEvents.js';
import { useItineraries } from './useItineraries.js';
import { NewEventModal } from './NewEventModal.js';
import {
  buildMonth,
  CalendarSkeleton,
  eachDayIso,
  EventList,
  MonthGrid,
  periodLabel,
  startOfDay,
  toIso,
  WeekGrid,
  weekDays,
  type CalendarEvent,
  type CalendarView,
} from './calendar.js';

/**
 * Agenda (AG-01/AG-06): calendário com filtro por roteiro e a **ocupação** de cada evento
 * (confirmadas / vagas, pendentes à parte). As três visões (mês, semana, lista) seguem
 * implementadas — só o seletor de visão foi tirado da tela por ora; a visão fixa é mês.
 * Cinco estados obrigatórios. Sem lógica de negócio: render + navegação.
 *
 * O calendário em si mora em `calendar.tsx`, compartilhado com a agenda do portal.
 */

interface AgendaProps {
  readonly onOpenGroup: (groupId: string) => void;
}

export function AgendaScreen({ onOpenGroup }: AgendaProps): React.JSX.Element {
  const { state, refresh, createEvent } = useScheduleEvents();
  const itineraries = useItineraries(true);
  const today = new Date();
  // Visão fixa em "mês" por ora: o seletor de visão foi removido da tela, mas mês/semana/lista
  // seguem implementados no módulo do calendário.
  const [view] = useState<CalendarView>('month');
  const [anchor, setAnchor] = useState(startOfDay(today));
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState<string | undefined>(undefined);
  const [itineraryFilter, setItineraryFilter] = useState('all');

  const itineraryName = (id: string): string =>
    itineraries.status === 'ready'
      ? (itineraries.itineraries.find((it) => it.id === id)?.name ?? '—')
      : '—';

  const allEvents = state.status === 'ready' ? state.events : [];
  const filtered = useMemo(
    () =>
      allEvents
        .filter((ev) => itineraryFilter === 'all' || ev.itineraryId === itineraryFilter)
        .map((ev) => toCalendarEvent(ev, itineraryName)),
    [allEvents, itineraryFilter, itineraries],
  );

  // Evento de mais de um dia ocupa cada dia do intervalo [startDate, endDate] no calendário.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of filtered) {
      for (const iso of eachDayIso(ev.startDate, ev.endDate)) {
        const list = map.get(iso) ?? [];
        list.push(ev);
        map.set(iso, list);
      }
    }
    return map;
  }, [filtered]);

  const shift = (delta: number) => {
    setAnchor((prev) =>
      view === 'week'
        ? new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + delta * 7)
        : new Date(prev.getFullYear(), prev.getMonth() + delta, 1),
    );
  };
  const filtersActive = itineraryFilter !== 'all';
  const clearFilters = () => setItineraryFilter('all');

  return (
    <main className="page page-wide">
      <div className="page-header agenda-header">
        <div>
          <h1 className="page-title">Agenda</h1>
          <p className="page-meta">Cada evento gera o grupo onde as inscrições vivem.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setModalDate(undefined);
            setModalOpen(true);
          }}
        >
          Novo evento
        </button>
      </div>

      <div className="cal-toolbar">
        {view !== 'list' && (
          <div className="cal-nav">
            <button
              type="button"
              className="icon-btn"
              aria-label="anterior"
              onClick={() => shift(-1)}
            >
              ‹
            </button>
            <span className="cal-month">{periodLabel(view, anchor)}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label="próximo"
              onClick={() => shift(1)}
            >
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
        )}
        <div className="cal-filter-group">
          <select
            className="field-input cal-filter-select"
            aria-label="Filtrar por roteiro"
            value={itineraryFilter}
            onChange={(e) => setItineraryFilter(e.target.value)}
          >
            <option value="all">Todos os roteiros</option>
            {itineraries.status === 'ready' &&
              itineraries.itineraries.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
          </select>
          {filtersActive && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
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

      {/* O calendário é a tela, não o resultado: aparece mesmo sem evento, porque é nele
          que se clica para criar o primeiro. */}
      {state.status === 'ready' && view === 'month' && (
        <MonthGrid
          weeks={buildMonth(anchor.getFullYear(), anchor.getMonth())}
          events={filtered}
          today={toIso(today)}
          onOpen={(ev) => onOpenGroup(ev.id)}
          onSelectDay={(iso) => {
            setModalDate(iso);
            setModalOpen(true);
          }}
        />
      )}

      {state.status === 'ready' && allEvents.length === 0 && (
        <p className="field-help cal-hint">
          Nenhum evento ainda. Clique num dia do calendário para criar o primeiro.
        </p>
      )}

      {state.status === 'ready' && allEvents.length > 0 && filtered.length === 0 && (
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">Nenhum evento com esse filtro</span>
            <span className="state-line">Ajuste o roteiro para ver mais.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary" onClick={clearFilters}>
            Limpar filtros
          </button>
        </div>
      )}
      {state.status === 'ready' && filtered.length > 0 && view === 'week' && (
        <WeekGrid
          days={weekDays(anchor)}
          eventsByDay={eventsByDay}
          today={toIso(today)}
          onOpen={(ev) => onOpenGroup(ev.id)}
        />
      )}
      {state.status === 'ready' && filtered.length > 0 && view === 'list' && (
        <EventList
          events={[...filtered].sort((a, b) => a.startDate.localeCompare(b.startDate))}
          onOpen={(ev) => onOpenGroup(ev.id)}
        />
      )}

      {modalOpen && (
        <NewEventModal
          initialDate={modalDate}
          onClose={() => setModalOpen(false)}
          onCreate={createEvent}
        />
      )}
    </main>
  );
}

/**
 * O calendário fala em `CalendarEvent`; aqui a agenda da equipe traduz o seu evento.
 * O `id` do evento de calendário é o **grupo** — é ele que a mesa abre.
 */
function toCalendarEvent(
  ev: ScheduleEventDto,
  itineraryName: (id: string) => string,
): CalendarEvent {
  return {
    id: ev.group.id,
    itineraryId: ev.itineraryId,
    startDate: ev.startDate,
    endDate: ev.endDate,
    name: ev.group.name,
    sub: itineraryName(ev.itineraryId),
    occupancy: ev.occupancy,
    isPrivate: ev.group.visibility === 'private',
  };
}

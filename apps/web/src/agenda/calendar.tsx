/**
 * O calendário da agenda (AG-01), sem saber de onde vêm os eventos: mês, semana e lista,
 * mais os helpers de data. O back-office alimenta com os eventos da equipe (com ocupação,
 * AG-06); o portal, com a vitrine pública (sem ocupação). Só render — nenhuma regra.
 */

export const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const MONTHS_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

export type CalendarView = 'month' | 'week' | 'list';

export interface Day {
  readonly iso: string;
  readonly day: number;
  readonly inMonth: boolean;
}

/** AG-06: confirmadas / vagas, com as pendentes à parte. Ausente = não exibir nada. */
export interface CalendarOccupancy {
  readonly capacityVehicles: number | null;
  readonly confirmedCount: number;
  readonly pendingCount: number;
  readonly vacancies: number | null;
}

export interface CalendarEvent {
  readonly id: string;
  readonly itineraryId: string;
  readonly startDate: string; // YYYY-MM-DD
  readonly endDate: string;
  readonly name: string;
  readonly sub: string;
  readonly occupancy?: CalendarOccupancy | undefined;
  /** AG-07: grupo privado ganha traço tracejado na borda. */
  readonly isPrivate?: boolean | undefined;
}

interface GridProps {
  readonly events: CalendarEvent[];
  readonly today: string;
  readonly onOpen: (event: CalendarEvent) => void;
  /** Clique no dia (fundo da célula). Ausente = calendário só de leitura, como no portal. */
  readonly onSelectDay?: ((iso: string) => void) | undefined;
}

interface WeekBar {
  readonly ev: CalendarEvent;
  readonly colStart: number; // 0..6 (coluna do 1º dia na semana)
  readonly colEnd: number; // 0..6 (coluna do último dia na semana)
  readonly lane: number; // linha de empilhamento
  readonly contLeft: boolean; // começou antes desta semana
  readonly contRight: boolean; // continua depois desta semana
}

/**
 * Distribui os eventos que tocam a semana em barras contínuas (grid-column start→end) e os
 * empilha em lanes sem sobreposição. Eventos ordenados por início; a atribuição é gulosa.
 */
function layoutWeek(week: Day[], events: CalendarEvent[]): { bars: WeekBar[]; lanes: number } {
  const weekStart = week[0]!.iso;
  const weekEnd = week[6]!.iso;
  const touching = events
    .filter((ev) => ev.startDate <= weekEnd && ev.endDate >= weekStart)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate));

  const laneEnd: number[] = []; // por lane: colEnd do último evento colocado
  const bars: WeekBar[] = [];
  for (const ev of touching) {
    let colStart = 0;
    for (let i = 0; i < 7; i += 1) {
      if (week[i]!.iso >= ev.startDate) {
        colStart = i;
        break;
      }
    }
    let colEnd = 6;
    for (let i = 6; i >= 0; i -= 1) {
      if (week[i]!.iso <= ev.endDate) {
        colEnd = i;
        break;
      }
    }
    let lane = 0;
    while (lane < laneEnd.length && laneEnd[lane]! >= colStart) lane += 1;
    laneEnd[lane] = colEnd;
    bars.push({
      ev,
      colStart,
      colEnd,
      lane,
      contLeft: ev.startDate < weekStart,
      contRight: ev.endDate > weekEnd,
    });
  }
  return { bars, lanes: laneEnd.length };
}

export function MonthGrid({
  weeks,
  events,
  today,
  onOpen,
  onSelectDay,
}: GridProps & { weeks: Day[][] }): React.JSX.Element {
  return (
    <div className="cal">
      <div className="cal-grid cal-head">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="cal-weekday">
            {wd}
          </div>
        ))}
      </div>
      {weeks.map((week, i) => {
        const { bars, lanes } = layoutWeek(week, events);
        return (
          <div
            key={i}
            className="cal-week"
            style={{
              gridTemplateRows:
                lanes > 0
                  ? `var(--cal-daynum-h) repeat(${lanes}, var(--cal-lane-h)) 1fr`
                  : `var(--cal-daynum-h) 1fr`,
            }}
          >
            {week.map((d, ci) =>
              onSelectDay ? (
                // A célula inteira é o alvo de "novo evento naquele dia"; as barras ficam
                // por cima e continuam abrindo a mesa do grupo.
                <button
                  key={d.iso}
                  type="button"
                  className={`cal-bgcell is-clickable${d.inMonth ? '' : ' is-out'}${d.iso === today ? ' is-today' : ''}`}
                  style={{ gridColumn: ci + 1, gridRow: '1 / -1' }}
                  onClick={() => onSelectDay(d.iso)}
                  aria-label={`Novo evento em ${d.iso}`}
                >
                  <span className="cal-daynum">{d.day}</span>
                </button>
              ) : (
                <div
                  key={d.iso}
                  className={`cal-bgcell${d.inMonth ? '' : ' is-out'}${d.iso === today ? ' is-today' : ''}`}
                  style={{ gridColumn: ci + 1, gridRow: '1 / -1' }}
                >
                  <span className="cal-daynum">{d.day}</span>
                </div>
              ),
            )}
            {bars.map((bar) => (
              <button
                key={`${bar.ev.id}-${bar.lane}`}
                type="button"
                className={`cal-bar${bar.contLeft ? ' is-cont-left' : ''}${bar.contRight ? ' is-cont-right' : ''}`}
                title={titleOf(bar.ev)}
                style={{
                  gridColumn: `${bar.colStart + 1} / ${bar.colEnd + 2}`,
                  gridRow: bar.lane + 2,
                }}
                onClick={() => onOpen(bar.ev)}
              >
                <span className="cal-bar-name">{bar.ev.name}</span>
                <span className="cal-bar-sub">{bar.ev.sub}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function WeekGrid({
  days,
  eventsByDay,
  today,
  onOpen,
}: Omit<GridProps, 'events'> & {
  days: Day[];
  eventsByDay: Map<string, CalendarEvent[]>;
}): React.JSX.Element {
  return (
    <div className="cal cal-week">
      <div className="cal-grid cal-head">
        {days.map((d, i) => (
          <div key={d.iso} className="cal-weekday">
            {WEEKDAYS[i]} {d.day}
          </div>
        ))}
      </div>
      <div className="cal-grid">
        {days.map((d) => (
          <div
            key={d.iso}
            className={`cal-cell cal-cell-week${d.iso === today ? ' is-today' : ''}`}
          >
            {(eventsByDay.get(d.iso) ?? []).map((ev) => (
              <button
                key={ev.id}
                type="button"
                className={`cal-event-full ${borderClass(ev)}`}
                onClick={() => onOpen(ev)}
              >
                <span className="cal-event-name">{ev.name}</span>
                <span className="cal-event-sub">{ev.sub}</span>
                <Occupancy occupancy={ev.occupancy} />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EventList({ events, onOpen }: Omit<GridProps, 'today'>): React.JSX.Element {
  return (
    <div className="cal-list">
      {events.map((ev) => (
        <button
          key={ev.id}
          type="button"
          className={`cal-list-row ${borderClass(ev)}`}
          onClick={() => onOpen(ev)}
        >
          <span className="cal-list-date">{rangeLabel(ev.startDate, ev.endDate)}</span>
          <span className="cal-list-main">
            <span className="cal-event-name">{ev.name}</span>
            <span className="cal-event-sub">{ev.sub}</span>
          </span>
          <Occupancy occupancy={ev.occupancy} />
        </button>
      ))}
    </div>
  );
}

function Occupancy({
  occupancy,
}: {
  occupancy: CalendarOccupancy | undefined;
}): React.JSX.Element | null {
  if (!occupancy) return null;
  const { capacityVehicles, confirmedCount, pendingCount, vacancies } = occupancy;
  return (
    <span className="occ">
      <span className={`occ-pill${vacancies === 0 ? ' is-full' : ''}`}>
        {capacityVehicles === null
          ? `${confirmedCount} confirmada${confirmedCount === 1 ? '' : 's'}`
          : `${confirmedCount}/${capacityVehicles} vagas`}
      </span>
      {pendingCount > 0 && (
        <span className="occ-pending">
          {pendingCount} pendente{pendingCount === 1 ? '' : 's'}
        </span>
      )}
    </span>
  );
}

/** Borda de dado: lotado × com vaga; privado (AG-07) ganha o traço tracejado. */
function borderClass(ev: CalendarEvent): string {
  const priv = ev.isPrivate === true ? ' is-private' : '';
  return (ev.occupancy?.vacancies === 0 ? 'is-full' : 'has-vacancy') + priv;
}

function titleOf(ev: CalendarEvent): string {
  if (!ev.occupancy) return ev.name;
  const { capacityVehicles, confirmedCount, pendingCount } = ev.occupancy;
  const base =
    capacityVehicles === null
      ? `${confirmedCount} confirmada(s)`
      : `${confirmedCount}/${capacityVehicles} vagas`;
  return `${ev.name} · ${pendingCount > 0 ? `${base}, ${pendingCount} pendente(s)` : base}`;
}

export function periodLabel(view: CalendarView, anchor: Date): string {
  if (view === 'week') {
    const days = weekDays(anchor);
    const first = days[0]!;
    const last = days[6]!;
    return `${first.day} ${MONTHS_SHORT[monthOf(first.iso)]} – ${last.day} ${MONTHS_SHORT[monthOf(last.iso)]} ${last.iso.slice(0, 4)}`;
  }
  return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
}

function rangeLabel(startIso: string, endIso: string): string {
  const s = `${Number(startIso.slice(8, 10))} ${MONTHS_SHORT[monthOf(startIso)]}`;
  const e = `${Number(endIso.slice(8, 10))} ${MONTHS_SHORT[monthOf(endIso)]}`;
  return startIso === endIso ? s : `${s} – ${e}`;
}

function monthOf(iso: string): number {
  return Number(iso.slice(5, 7)) - 1;
}

export function buildMonth(year: number, month: number): Day[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const weeks: Day[][] = [];
  const walker = new Date(start);
  for (let w = 0; w < 6; w += 1) {
    const week: Day[] = [];
    for (let d = 0; d < 7; d += 1) {
      week.push({
        iso: toIso(walker),
        day: walker.getDate(),
        inMonth: walker.getMonth() === month,
      });
      walker.setDate(walker.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function weekDays(anchor: Date): Day[] {
  const start = addDays(anchor, -anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    return { iso: toIso(d), day: d.getDate(), inMonth: true };
  });
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Dias ISO (YYYY-MM-DD) de `startIso` a `endIso`, inclusive. Itera em UTC para não sofrer
 * com fuso. Intervalo invertido ou fim ausente devolve só o dia inicial.
 */
export function eachDayIso(startIso: string, endIso: string): string[] {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = (endIso || startIso).split('-').map(Number);
  const cur = new Date(Date.UTC(sy ?? 1970, (sm ?? 1) - 1, sd ?? 1));
  const end = new Date(Date.UTC(ey ?? 1970, (em ?? 1) - 1, ed ?? 1));
  if (end < cur) return [startIso];
  const out: string[] = [];
  while (cur <= end && out.length < 366) {
    const mm = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(cur.getUTCDate()).padStart(2, '0');
    out.push(`${cur.getUTCFullYear()}-${mm}-${dd}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function toIso(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export function CalendarSkeleton(): React.JSX.Element {
  return (
    <div className="cal" aria-hidden>
      <div className="cal-grid cal-head">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="cal-weekday">
            {wd}
          </div>
        ))}
      </div>
      {Array.from({ length: 5 }, (_, w) => (
        <div key={w} className="cal-grid">
          {Array.from({ length: 7 }, (_, d) => (
            <div key={d} className="cal-cell">
              <span className="cal-skel" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

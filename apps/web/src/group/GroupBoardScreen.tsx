import { useState } from 'react';
import { useGroupBoard, type BoardRow, type BoardView } from './useGroupBoard.js';
import { useGroupActions } from './useGroupActions.js';
import { ScheduleLifecycleActions } from './ScheduleLifecycleActions.js';
import { GroupDocumentsMenu } from './GroupDocumentsMenu.js';
import { RowPanel } from './RowPanel.js';
import { checkInAvailability, parseLocalDate } from '@expedition/domain';
import { toLocalDate } from '../ui/toLocalDate.js';
import { ResultPanel } from './ResultPanel.js';
import { AllocatePanel } from './AllocatePanel.js';
import { brl } from '../ui/money.js';

/**
 * Mesa do grupo — Tabela 1 (GR-07/GR-13/GR-12/GR-06). Cabeçalho do grupo + faixa de
 * estatísticas + barra de meta segmentada + tabela de famílias com rodapé de totais.
 * Cor é dado: verde = pago/confirmado, cinza = pendente, vermelho = cancelado; laranja
 * (accent do tenant) só na barra "a receber", nunca em status.
 */

interface Props {
  readonly groupId: string;
  readonly onBack: () => void;
}

export function GroupBoardScreen({ groupId, onBack }: Props): React.JSX.Element {
  const { state, refresh } = useGroupBoard(groupId);

  return (
    <main className="page page-wide">
      <button type="button" className="btn btn-secondary btn-sm back-btn" onClick={onBack}>
        ‹ Voltar à agenda
      </button>

      {state.status === 'loading' && <BoardSkeleton />}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para abrir o grupo</span>
            <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <Board board={state.board} refresh={refresh} onDeleted={onBack} />
      )}
    </main>
  );
}

function Board({
  board,
  refresh,
  onDeleted,
}: {
  board: BoardView;
  refresh: () => void;
  onDeleted: () => void;
}): React.JSX.Element {
  const { group, rows, totals, occupancy } = board;
  const actions = useGroupActions(refresh);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const projected = totals.contractedProjectedCents;
  const received = totals.receivedCents;
  const dueEnrolled = Math.max(0, totals.dueProjectedCents);
  const pctReceived = projected > 0 ? (received / projected) * 100 : 0;
  const pctDue = projected > 0 ? (dueEnrolled / projected) * 100 : 0;

  return (
    <>
      <div className="page-header agenda-header">
        <div>
          <div className="board-titlerow">
            <h1 className="page-title">{group.name}</h1>
            <span className={`pill ${statusPill(group.status)}`}>{statusLabel(group.status)}</span>
          </div>
          <p className="page-meta">
            {group.startDate} → {group.endDate}
            <span className="meta-dot" />
            {group.pricingMode === 'manual' ? 'preço manual' : 'preço do roteiro'}
            {occupancy.capacityVehicles !== null && (
              <>
                <span className="meta-dot" />
                {occupancy.occupiedVehicles}/{occupancy.capacityVehicles} vagas
              </>
            )}
          </p>
        </div>
        <div className="entity-actions">
          <GroupDocumentsMenu groupId={group.id} confirmedCount={totals.confirmedCount} />
          <ScheduleLifecycleActions
            groupId={group.id}
            scheduleEventId={group.scheduleEventId}
            groupStatus={group.status}
            bookingCount={rows.length}
            startDate={group.startDate}
            endDate={group.endDate}
            onChanged={refresh}
            onDeleted={onDeleted}
          />
        </div>
      </div>

      {/*
        A faixa segue o caminho do dinheiro: quanto vale o grupo, quanto disso já é firme,
        quanto entrou e quanto falta. "Recebido" já é líquido — a taxa do gateway é
        repassada ao cliente e nunca foi da empresa (PG-08).
      */}
      <div className="stats">
        <Stat
          value={brl(projected)}
          label="Projetado"
          context={`soma de ${rows.length} inscrição(ões)`}
        />
        <Stat
          value={brl(totals.contractedConfirmedCents)}
          label="Confirmado"
          context={`${totals.confirmedCount} de ${rows.length} já pagaram`}
        />
        <Stat
          value={brl(received)}
          label="Recebido"
          context={
            totals.customerPaidCents > received
              ? `clientes pagaram ${brl(totals.customerPaidCents)}`
              : 'na conta'
          }
          isGo
        />
        <Stat value={brl(dueEnrolled)} label="A receber" context="o que falta" />
      </div>

      {/* barra de meta segmentada */}
      <div className="metabar-wrap">
        <div className="metabar">
          <div className="metabar-seg seg-go" style={segStyle(pctReceived)} />
          <div className="metabar-seg seg-o" style={segStyle(pctDue)} />
        </div>
        <div className="metabar-legend">
          <span className="legend-item">
            <span className="legend-dot dot-go" /> Recebido {Math.round(pctReceived)}%
          </span>
          <span className="legend-item">
            <span className="legend-dot dot-o" /> A receber {Math.round(pctDue)}%
          </span>
          {occupancy.vacancies !== null && (
            <span className="legend-item">
              <span className="legend-dot dot-relief" /> {occupancy.vacancies} vagas abertas
            </span>
          )}
        </div>
      </div>

      <AllocatePanel groupId={group.id} onAllocated={refresh} />

      {/* Tabela 1: participantes / famílias */}
      <div className="tbl-wrap">
        <div className="tbl">
          <div className="tbl-row tbl-head">
            <span>Família</span>
            <span className="col-num">Pessoas</span>
            <span className="col-num">Contratado</span>
            <span className="col-num">Recebido</span>
            <span className="col-num">A receber</span>
            <span className="col-num">Pago</span>
            <span>Situação</span>
            <span className="col-center">Embarque</span>
            <span className="col-center">NF</span>
          </div>

          {rows.length === 0 && (
            <div className="tbl-empty">
              Nenhuma família neste grupo ainda. Aloque inscrições pela fila ou manualmente.
            </div>
          )}

          {rows.map((row) => (
            <div key={row.bookingId}>
              <Row
                row={row}
                group={group}
                actions={actions}
                expanded={expandedId === row.bookingId}
                onToggle={() =>
                  setExpandedId((id) => (id === row.bookingId ? null : row.bookingId))
                }
              />
              {expandedId === row.bookingId && <RowPanel row={row} actions={actions} />}
            </div>
          ))}

          <div className="tbl-row tbl-foot">
            <span>Totais (projetado)</span>
            <span className="col-num">—</span>
            <span className="col-num mono">{brl(projected)}</span>
            <span className="col-num mono">{brl(received)}</span>
            <span className="col-num mono accent">{brl(dueEnrolled)}</span>
            <span className="col-num">—</span>
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>

      <ResultPanel groupId={group.id} />
    </>
  );
}

function Row({
  row,
  group,
  actions,
  expanded,
  onToggle,
}: {
  row: BoardRow;
  group: BoardView['group'];
  actions: ReturnType<typeof useGroupActions>;
  expanded: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  const cancelled = row.status === 'cancelled';
  const pct = row.contractedCents > 0 ? (row.receivedCents / row.contractedCents) * 100 : 0;
  return (
    <div
      className={`tbl-row tbl-row-click${cancelled ? ' is-cancelled' : ''}${expanded ? ' is-expanded' : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <span className="cell-family">
        <span className={`caret${expanded ? ' is-open' : ''}`} aria-hidden>
          ›
        </span>
        <span className={`avatar ${avatarClass(row.status)}`}>{initials(row.responsibleName)}</span>
        <span className="cell-id">
          <span className="cell-name">{row.responsibleName}</span>
          {/* Sem carro é informação de embarque, não ausência de campo: a equipe precisa
              saber de quem ainda falta o cadastro. */}
          <span className={`cell-sub mono${row.vehicle ? '' : ' is-missing'}`}>
            {row.vehicle
              ? [row.vehicle.model, row.vehicle.plate].filter(Boolean).join(' · ')
              : 'sem carro cadastrado'}
          </span>
        </span>
      </span>
      <span className="col-num mono">{row.participants.length}</span>
      <span className="col-num mono">{brl(row.contractedCents)}</span>
      <span className="col-num mono">{brl(row.receivedCents)}</span>
      <span className="col-num mono">{brl(row.dueCents)}</span>
      <span className="col-num">
        <InlineBar pct={pct} cancelled={cancelled} />
      </span>
      <span>
        <span className={`pill ${statusPill(row.status)}`}>{statusLabel(row.status)}</span>
      </span>
      <span className="col-center">
        <CheckInCell row={row} group={group} actions={actions} />
      </span>
      <span className="col-center">
        <span className={`nf ${row.invoiceChecked ? 'nf-on' : 'nf-off'}`}>
          {row.invoiceChecked ? '✓' : '—'}
        </span>
      </span>
    </div>
  );
}

/**
 * GR-14 — a célula de embarque. A régua é a mesma do servidor (`checkInAvailability` do
 * domínio), então o botão só aparece quando a ação existe de verdade; fora da janela a
 * célula mostra o traço, e depois do check-in mostra o horário.
 *
 * O clique não pode abrir a linha: check-in e "expandir" são ações diferentes.
 */
function CheckInCell({
  row,
  group,
  actions,
}: {
  row: BoardRow;
  group: BoardView['group'];
  actions: ReturnType<typeof useGroupActions>;
}): React.JSX.Element {
  if (row.checkedInAt) {
    return <span className="pill pill-go">{hourOf(row.checkedInAt)}</span>;
  }
  const availability = checkInAvailability({
    status: row.status,
    alreadyCheckedIn: false,
    audience: 'team',
    startDate: parseLocalDate(group.startDate),
    endDate: parseLocalDate(group.endDate),
    today: toLocalDate(new Date()),
  });
  if (!availability.allowed) {
    return <span className="nf nf-off">—</span>;
  }
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      disabled={actions.busy}
      onClick={(event) => {
        event.stopPropagation();
        void actions.checkIn(row.bookingId);
      }}
    >
      Check-in
    </button>
  );
}

/** Só a hora do embarque: a data é a da saída, que já está no cabeçalho. */
function hourOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function InlineBar({ pct, cancelled }: { pct: number; cancelled: boolean }): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, pct));
  const fill = pct >= 100 ? 'fill-go' : pct > 0 ? 'fill-o' : '';
  return (
    <span className="inbar">
      <span className="inbar-track">
        {!cancelled && <span className={`inbar-fill ${fill}`} style={{ width: `${clamped}%` }} />}
      </span>
      <span className="inbar-pct">{cancelled ? '—' : `${Math.round(pct)}%`}</span>
    </span>
  );
}

function Stat({
  value,
  label,
  context,
  isGo,
}: {
  value: string;
  label: string;
  context: string;
  isGo?: boolean;
}): React.JSX.Element {
  return (
    <div className="stat">
      <span className={`stat-num${isGo ? ' is-go' : ''}`}>
        <span className="stat-unit">R$</span>
        {value}
      </span>
      <span className="stat-label">{label}</span>
      <span className="stat-context">{context}</span>
    </div>
  );
}

function BoardSkeleton(): React.JSX.Element {
  return (
    <div className="skeleton" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="skel-card">
          <div className="skel-avatar" />
          <div className="skel-bars">
            <div className="skel-bar" />
            <div className="skel-bar short" />
          </div>
        </div>
      ))}
    </div>
  );
}

function segStyle(pct: number): React.CSSProperties {
  return { width: `${Math.max(0, Math.min(100, pct))}%` };
}

function statusPill(status: string): string {
  if (status === 'confirmed') return 'pill-go';
  if (status === 'cancelled' || status === 'rejected') return 'pill-no';
  return 'pill-neutral';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    confirmed: 'confirmada',
    pending: 'pendente',
    cancelled: 'cancelada',
    rejected: 'recusada',
    draft: 'rascunho',
    open: 'aberto',
  };
  return map[status] ?? status;
}

function avatarClass(status: string): string {
  if (status === 'confirmed') return 'av-go';
  if (status === 'cancelled' || status === 'rejected') return 'av-no';
  return 'av-pending';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

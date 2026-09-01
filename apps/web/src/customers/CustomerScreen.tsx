import { Fragment, useState } from 'react';
import {
  useCustomerFile,
  type CustomerFileView,
  type FileExpedition,
  type FileCashbackEntry,
} from './useCustomerFile.js';
import { useCustomerInvite } from './useCustomerInvite.js';
import { FamilyLinkActions } from './FamilyLinkActions.js';
import { FamilyEditor } from './FamilyEditor.js';
import { AcceptedTermView } from '../documents/AcceptedTermView.js';

/**
 * Ficha do cliente (CL-06). Padrão "Cabeçalho de entidade + abas + tabela" do design
 * system: o cliente no topo, três abas (Expedições, Financeiro, Cashback) e uma tabela
 * por aba. As abas são estado de interface — usam o accent do tenant; cor de dado
 * (verde/vermelho/cinza) fica reservada a situação e dinheiro. Zero cálculo aqui:
 * contratado, recebido, a receber e o saldo vêm derivados do servidor.
 */

type Tab = 'expedicoes' | 'financeiro' | 'cashback' | 'dados';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'expedicoes', label: 'Expedições' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'cashback', label: 'Cashback' },
];

/** No back-office a ficha ganha a aba de edição; no portal, não (PC-06/PC-07). */
const BACKOFFICE_TABS: readonly { id: Tab; label: string }[] = [
  ...TABS,
  { id: 'dados', label: 'Dados' },
];

interface Props {
  readonly customerId: string;
  readonly onBack?: (() => void) | undefined;
  readonly onOpenGroup?: ((groupId: string) => void) | undefined;
}

export function CustomerScreen({ customerId, onBack, onOpenGroup }: Props): React.JSX.Element {
  const { state, refresh } = useCustomerFile(customerId);

  return (
    <main className="page page-wide">
      {onBack && (
        <button type="button" className="btn btn-secondary btn-sm back-btn" onClick={onBack}>
          ‹ Voltar aos clientes
        </button>
      )}

      {state.status === 'loading' && <FileSkeleton />}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para abrir a ficha</span>
            <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <File
          file={state.file}
          onOpenGroup={onOpenGroup}
          canInvite={Boolean(onBack)}
          onChanged={refresh}
        />
      )}
    </main>
  );
}

function File({
  file,
  onOpenGroup,
  canInvite,
  onChanged,
}: {
  file: CustomerFileView;
  onOpenGroup?: ((groupId: string) => void) | undefined;
  canInvite: boolean;
  onChanged: () => void;
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('expedicoes');
  const { customer, family, expeditions, cashback } = file;

  return (
    <>
      <div className="entity-head">
        <span className="avatar av-lg">{initials(customer.fullName)}</span>
        <div className="entity-id">
          <div className="board-titlerow">
            <h1 className="page-title">{customer.fullName}</h1>
            <span className="pill pill-neutral">{roleLabel(customer.role)}</span>
          </div>
          <p className="page-meta">
            <span className="mono">{customer.cpf}</span>
            {customer.phone && (
              <>
                <span className="meta-dot" />
                <span className="mono">{customer.phone}</span>
              </>
            )}
            {customer.email && (
              <>
                <span className="meta-dot" />
                {customer.email}
              </>
            )}
          </p>
        </div>
        {canInvite && (
          <div className="entity-actions">
            {customer.role === 'responsible' && <InviteControl customerId={customer.id} />}
            <FamilyLinkActions customer={customer} family={family} onChanged={onChanged} />
          </div>
        )}
      </div>

      <div className="tabs" role="tablist" aria-label="Abas da ficha">
        {(canInvite ? BACKOFFICE_TABS : TABS).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'expedicoes' && (
        <ExpeditionsTab expeditions={expeditions} onOpenGroup={onOpenGroup} />
      )}
      {tab === 'financeiro' && <FinanceTab expeditions={expeditions} />}
      {tab === 'cashback' && <CashbackTab cashback={cashback} />}
      {tab === 'dados' && <FamilyEditor customerId={customer.id} onSaved={onChanged} />}
    </>
  );
}

function InviteControl({ customerId }: { customerId: string }): React.JSX.Element {
  const { busy, invite } = useCustomerInvite();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    const result = await invite(customerId);
    if (result.ok) setLink(result.actionLink ?? 'enviado por e-mail');
    else setError(result.message);
  };

  if (link) {
    return (
      <div className="invite-callout feedback feedback-info">
        <div className="token-callout-body">
          <span className="rowpanel-title">Link de acesso ao portal</span>
          <code className="token-value">{link}</code>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLink(null)}>
          Ok
        </button>
      </div>
    );
  }

  return (
    <div className="invite-control">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy}
        onClick={() => void send()}
      >
        {busy ? 'Convidando…' : 'Convidar ao portal'}
      </button>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function ExpeditionsTab({
  expeditions,
  onOpenGroup,
}: {
  expeditions: FileExpedition[];
  onOpenGroup?: ((groupId: string) => void) | undefined;
}): React.JSX.Element {
  // No back-office, clicar abre a mesa do grupo (onde o termo mora no RowPanel). No portal
  // (sem onOpenGroup), a linha expande aqui mesmo para ver o termo aceito da inscrição.
  const [openTermBooking, setOpenTermFor] = useState<string | null>(null);
  const open = onOpenGroup;
  const clickable = Boolean(open);
  const activate = (trip: FileExpedition) =>
    open
      ? open(trip.groupId)
      : setOpenTermFor((id) => (id === trip.bookingId ? null : trip.bookingId));

  if (expeditions.length === 0) {
    return (
      <div className="state" role="status">
        <div className="state-text">
          <span className="state-title">Nenhuma expedição ainda</span>
          <span className="state-line">Nenhuma saída registrada ainda.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tbl-wrap">
      <div className="tbl tbl-exp">
        <div className="tbl-row tbl-head">
          <span>Roteiro</span>
          <span>Datas</span>
          <span>Papel</span>
          <span className="col-num">Pessoas</span>
          <span>Situação</span>
        </div>
        {expeditions.map((trip) => (
          <Fragment key={trip.bookingId}>
            <div
              className={`tbl-row tbl-row-click${trip.status === 'cancelled' ? ' is-cancelled' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => activate(trip)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  activate(trip);
                }
              }}
            >
              <span className="cell-name">{trip.groupName}</span>
              <span className="mono">
                {trip.startDate} → {trip.endDate}
              </span>
              <span>{roleLabel(trip.role)}</span>
              <span className="col-num mono">{trip.participantCount}</span>
              <span>
                <span className={`pill ${statusPill(trip.status)}`}>
                  {statusLabel(trip.status)}
                </span>
              </span>
            </div>
            {!clickable && openTermBooking === trip.bookingId && (
              <div className="rowpanel">
                <AcceptedTermView bookingId={trip.bookingId} />
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function FinanceTab({ expeditions }: { expeditions: FileExpedition[] }): React.JSX.Element {
  const active = expeditions.filter((t) => t.status !== 'cancelled');
  if (expeditions.length === 0) {
    return (
      <div className="state" role="status">
        <div className="state-text">
          <span className="state-title">Sem lançamentos</span>
          <span className="state-line">O financeiro aparece quando houver uma inscrição.</span>
        </div>
      </div>
    );
  }
  const totalContracted = active.reduce((s, t) => s + t.contractedCents, 0);
  const totalReceived = active.reduce((s, t) => s + t.receivedCents, 0);
  const totalDue = active.reduce((s, t) => s + t.dueCents, 0);

  return (
    <div className="tbl-wrap">
      <div className="tbl tbl-fin">
        <div className="tbl-row tbl-head">
          <span>Expedição</span>
          <span className="col-num">Contratado</span>
          <span className="col-num">Recebido</span>
          <span className="col-num">A receber</span>
        </div>
        {expeditions.map((trip) => (
          <div
            key={trip.bookingId}
            className={`tbl-row${trip.status === 'cancelled' ? ' is-cancelled' : ''}`}
          >
            <span className="cell-name">{trip.groupName}</span>
            <span className="col-num mono">{brl(trip.contractedCents)}</span>
            <span className="col-num mono">{brl(trip.receivedCents)}</span>
            <span className="col-num mono accent">{brl(trip.dueCents)}</span>
          </div>
        ))}
        <div className="tbl-row tbl-foot">
          <span>Totais (ativas)</span>
          <span className="col-num mono">{brl(totalContracted)}</span>
          <span className="col-num mono">{brl(totalReceived)}</span>
          <span className="col-num mono accent">{brl(totalDue)}</span>
        </div>
      </div>
    </div>
  );
}

export function CashbackTab({
  cashback,
}: {
  cashback: CustomerFileView['cashback'];
}): React.JSX.Element {
  return (
    <>
      <div className="stats">
        <div className="stat">
          <span className={`stat-num${cashback.balanceCents > 0 ? ' is-go' : ''}`}>
            <span className="stat-unit">R$</span>
            {brl(cashback.balanceCents)}
          </span>
          <span className="stat-label">Saldo de cashback</span>
          <span className="stat-context">
            {cashback.entries.length} lançamento{cashback.entries.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {cashback.entries.length === 0 ? (
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">Sem extrato</span>
            <span className="state-line">
              Nenhum crédito ou resgate ainda. O cashback é liberado após a saída.
            </span>
          </div>
        </div>
      ) : (
        <div className="tbl-wrap">
          <div className="tbl tbl-cb">
            <div className="tbl-row tbl-head">
              <span>Tipo</span>
              <span>Disponível em</span>
              <span>Expira em</span>
              <span className="col-num">Valor</span>
            </div>
            {cashback.entries.map((entry) => (
              <CashbackRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function CashbackRow({ entry }: { entry: FileCashbackEntry }): React.JSX.Element {
  const credit = entry.amountCents >= 0;
  return (
    <div className="tbl-row">
      <span>{cashbackTypeLabel(entry.type)}</span>
      <span className="mono">{entry.availableFrom ?? '—'}</span>
      <span className="mono">{entry.expiresAt ?? '—'}</span>
      <span className={`col-num mono${credit ? ' is-go' : ''}`}>
        {credit ? '' : '-'}
        {brl(Math.abs(entry.amountCents))}
      </span>
    </div>
  );
}

function FileSkeleton(): React.JSX.Element {
  return (
    <div className="skeleton" aria-hidden>
      <div className="skel-card">
        <div className="skel-avatar" />
        <div className="skel-bars">
          <div className="skel-bar" />
          <div className="skel-bar short" />
        </div>
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="skel-card">
          <div className="skel-bars">
            <div className="skel-bar" />
            <div className="skel-bar short" />
          </div>
        </div>
      ))}
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

function roleLabel(role: 'responsible' | 'companion'): string {
  return role === 'responsible' ? 'Responsável' : 'Acompanhante';
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
  };
  return map[status] ?? status;
}

function cashbackTypeLabel(type: string): string {
  const map: Record<string, string> = {
    accrual: 'crédito',
    redemption: 'resgate',
    expiry: 'expiração',
    adjustment: 'ajuste',
  };
  return map[type] ?? type;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

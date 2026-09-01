import { useState } from 'react';
import { useQueue, type ActionResult, type GroupOption, type QueueItem } from './useQueue.js';
import { useRecentBookings } from './useRecentBookings.js';
import { RecentBookings } from './RecentBookings.js';
import { IntakeDetailModal } from './IntakeDetailModal.js';
import { initialGroupId } from './queueSelection.js';

/**
 * Fila de alocação (§5.7.2 / IN-17..19). Lista de cartões agrupada por roteiro — cada
 * item carrega decisão própria, então cartão, não tabela. Avisos em pill neutra e faixa
 * de alerta quando parada há mais de 24 h (IN-12). Alocar cria cliente + booking + snapshot.
 */
export function QueueScreen(): React.JSX.Element {
  const { state, refresh, busy, allocate, discard } = useQueue();
  const recent = useRecentBookings();
  const [openItem, setOpenItem] = useState<QueueItem | null>(null);

  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1 className="page-title">Inscrições</h1>
        <p className="page-meta">
          O que chegou e ainda não foi processado, e as últimas inscrições já alocadas.
        </p>
      </div>

      <div className="dash-section-head is-tight">
        <h2 className="card-title">Não processadas</h2>
      </div>

      {state.status === 'loading' && <QueueSkeleton />}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar a fila</span>
            <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' && state.items.length === 0 && (
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">Nada aguardando revisão</span>
            <span className="state-line">
              O que chega pelo site ou pelo app do cliente aparece aqui para ser alocado.
            </span>
          </div>
        </div>
      )}

      {state.status === 'ready' &&
        groupByForm(state.items).map(([formId, items]) => (
          <section key={formId} className="queue-section">
            <h2 className="queue-section-title">Roteiro {formId}</h2>
            <div className="queue-cards">
              {items.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  onOpen={() => setOpenItem(item)}
                  groups={state.groups}
                  busy={busy}
                  onAllocate={allocate}
                  onDiscard={discard}
                />
              ))}
            </div>
          </section>
        ))}

      <div className="dash-section-head is-tight recent-head">
        <h2 className="card-title">Últimas inscrições</h2>
      </div>
      <RecentBookings state={recent.state} onRetry={recent.refresh} />

      {openItem && state.status === 'ready' && (
        <IntakeDetailModal
          item={openItem}
          groups={state.groups}
          busy={busy}
          onAllocate={allocate}
          onClose={() => setOpenItem(null)}
        />
      )}
    </main>
  );
}

function QueueCard({
  item,
  groups,
  busy,
  onAllocate,
  onDiscard,
  onOpen,
}: {
  item: QueueItem;
  groups: GroupOption[];
  busy: boolean;
  onAllocate: (intakeId: string, groupId: string) => Promise<ActionResult>;
  onDiscard: (intakeId: string, reason: string) => Promise<ActionResult>;
  onOpen: () => void;
}): React.JSX.Element {
  // Pedido do app já sabe a saída escolhida pelo cliente (§5.8) — se ela ainda existe.
  const [groupId, setGroupId] = useState(() => initialGroupId(item.chosenGroupId, groups));
  const [discarding, setDiscarding] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const stale = hoursSince(item.receivedAt) >= 24;

  const act = async (promise: Promise<ActionResult>) => {
    setError(null);
    const result = await promise;
    if (!result.ok) setError(result.message);
  };

  return (
    <article className="qcard">
      {stale && (
        <div className="qcard-alert">
          Parada há {sinceLabel(item.receivedAt)} — decida antes que o cliente cobre.
        </div>
      )}

      <div className="qcard-head">
        <span className="avatar av-pending">{initials(item.responsibleName)}</span>
        <div className="qcard-id">
          <span className="qcard-name">{item.responsibleName}</span>
          <span className="qcard-cpf">{item.responsibleCpf}</span>
        </div>
        <div className="qcard-grow" />
        <span className="pill pill-neutral">{sinceLabel(item.receivedAt)}</span>
      </div>

      <div className="qcard-tags">
        <span className="pill pill-neutral">
          {item.companionCount === 0
            ? 'sem acompanhantes'
            : `${item.companionCount} acompanhante${item.companionCount > 1 ? 's' : ''}`}
        </span>
        {item.desiredDate && (
          <span className="pill pill-neutral">data desejada {item.desiredDate}</span>
        )}
        {item.warnings.map((w, i) => (
          <span key={i} className="pill pill-warn" title={w}>
            aviso
          </span>
        ))}
      </div>

      {error && (
        <div className="feedback feedback-error">
          <span className="feedback-dot" />
          <span>{error}</span>
        </div>
      )}

      {discarding ? (
        <div className="qcard-actions">
          <input
            className="field-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo do descarte"
          />
          <button
            type="button"
            className="btn btn-secondary btn-danger"
            disabled={busy || reason.trim() === ''}
            onClick={() => void act(onDiscard(item.id, reason.trim()))}
          >
            Descartar
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setDiscarding(false)}>
            Voltar
          </button>
        </div>
      ) : (
        <div className="qcard-actions">
          <select
            className="field-input"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">Escolher grupo</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || groupId === ''}
            onClick={() => void act(onAllocate(item.id, groupId))}
          >
            Alocar no grupo
          </button>
          <button type="button" className="btn btn-secondary" onClick={onOpen}>
            Ver detalhes
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setDiscarding(true)}>
            Descartar
          </button>
        </div>
      )}
    </article>
  );
}

function QueueSkeleton(): React.JSX.Element {
  return (
    <div className="queue-cards" aria-hidden>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="qcard">
          <div className="skel-card">
            <div className="skel-avatar" />
            <div className="skel-bars">
              <div className="skel-bar" />
              <div className="skel-bar short" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function groupByForm(items: QueueItem[]): [string, QueueItem[]][] {
  const map = new Map<string, QueueItem[]>();
  for (const item of items) {
    const key = item.formId ?? '—';
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return [...map.entries()];
}

function hoursSince(iso: string): number {
  const then = new Date(iso).getTime();
  return (Date.now() - then) / 3_600_000;
}

function sinceLabel(iso: string): string {
  const h = hoursSince(iso);
  if (h < 1) return 'há minutos';
  if (h < 24) return `há ${Math.floor(h)} h`;
  const days = Math.floor(h / 24);
  return `há ${days} dia${days > 1 ? 's' : ''}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

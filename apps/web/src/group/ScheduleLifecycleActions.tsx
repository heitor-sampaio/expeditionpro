import { useEffect, useRef, useState } from 'react';
import {
  resolveScheduleActions,
  scheduleErrorFor,
  type ScheduleActionId,
} from './scheduleActions.js';
import { useScheduleLifecycle } from './useScheduleLifecycle.js';
import { NavIcon } from '../ui/NavIcon.js';

/**
 * Ações da saída no cabeçalho da mesa (AG-04/AG-05): editar datas, cancelar e excluir,
 * num menu suspenso com um modal por ação. Excluir e cancelar são irreversíveis, então
 * pedem confirmação — e o cancelamento pede o motivo, que vai para a trilha.
 *
 * Nenhuma regra aqui: o que fica disponível vem de `resolveScheduleActions` e a decisão
 * final é do servidor.
 */

interface Props {
  readonly groupId: string;
  readonly scheduleEventId: string | null;
  readonly groupStatus: string;
  readonly bookingCount: number;
  readonly startDate: string;
  readonly endDate: string;
  readonly onChanged: () => void;
  readonly onDeleted: () => void;
}

export function ScheduleLifecycleActions({
  groupId,
  scheduleEventId,
  groupStatus,
  bookingCount,
  startDate,
  endDate,
  onChanged,
  onDeleted,
}: Props): React.JSX.Element {
  const { busy, editDates, cancel, remove } = useScheduleLifecycle();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<ScheduleActionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [dates, setDates] = useState({ startDate, endDate });
  const ref = useRef<HTMLDivElement>(null);

  const actions = resolveScheduleActions({ bookingCount, groupStatus });

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const close = () => {
    setDialog(null);
    setError(null);
  };

  const run = async (action: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
    const result = await action();
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    return true;
  };

  return (
    <div className="link-actions" ref={ref}>
      <button
        type="button"
        className="btn btn-secondary btn-sm btn-icon"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <NavIcon id="menu" />
        <span>Menu</span>
      </button>

      {menuOpen && (
        <div className="menu" role="menu">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              className={`menu-item${action.id === 'delete' ? ' menu-item-danger' : ''}`}
              disabled={!action.enabled}
              title={action.reason ?? undefined}
              onClick={() => {
                setMenuOpen(false);
                setError(null);
                setDialog(action.id);
              }}
            >
              {action.label}
              {action.reason && <span className="menu-item-reason">{action.reason}</span>}
            </button>
          ))}
        </div>
      )}

      {dialog === 'edit' && (
        <Modal
          title="Editar datas da saída"
          subtitle="O nome do grupo acompanha a nova data. Inscrições já feitas mantêm o valor congelado."
          error={error}
          busy={busy}
          confirmLabel="Salvar datas"
          canConfirm={dates.startDate !== '' && dates.endDate !== ''}
          onClose={close}
          onConfirm={async () => {
            // Sem o id do evento não há o que editar — e ficar mudo esconde o problema.
            if (!scheduleEventId) {
              setError(scheduleErrorFor('missing_event'));
              return;
            }
            if (await run(() => editDates(scheduleEventId, dates.startDate, dates.endDate))) {
              close();
              onChanged();
            }
          }}
        >
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Início</span>
              <input
                type="date"
                className="field-input is-mono"
                value={dates.startDate}
                onChange={(e) => setDates((d) => ({ ...d, startDate: e.target.value }))}
              />
            </label>
            <label className="field">
              <span className="field-label">Término</span>
              <input
                type="date"
                className="field-input is-mono"
                value={dates.endDate}
                onChange={(e) => setDates((d) => ({ ...d, endDate: e.target.value }))}
              />
            </label>
          </div>
        </Modal>
      )}

      {dialog === 'cancel' && (
        <Modal
          title="Cancelar esta saída?"
          subtitle="Ela sai da vitrine e da auto-inscrição, mas continua na agenda com o registro do cancelamento. As inscrições e o dinheiro já lançado ficam como estão — devolução e cashback são avaliados caso a caso."
          error={error}
          busy={busy}
          confirmLabel="Cancelar saída"
          canConfirm={reason.trim() !== ''}
          onClose={close}
          onConfirm={async () => {
            if (await run(() => cancel(groupId, reason.trim()))) {
              close();
              setReason('');
              onChanged();
            }
          }}
        >
          <label className="field field-full">
            <span className="field-label">Motivo</span>
            <textarea
              className="field-textarea"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Estrada interditada, número mínimo não atingido…"
            />
            <span className="field-help">Fica registrado na trilha de auditoria.</span>
          </label>
        </Modal>
      )}

      {dialog === 'delete' && (
        <Modal
          title="Excluir esta saída?"
          subtitle="A data some da agenda junto com o grupo, e não dá para desfazer. Só é possível enquanto não houver inscrição nem gasto lançado."
          error={error}
          busy={busy}
          confirmLabel="Excluir saída"
          canConfirm
          onClose={close}
          onConfirm={async () => {
            if (!scheduleEventId) {
              setError(scheduleErrorFor('missing_event'));
              return;
            }
            if (await run(() => remove(scheduleEventId))) {
              close();
              onDeleted();
            }
          }}
        >
          <></>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  subtitle,
  error,
  busy,
  confirmLabel,
  canConfirm,
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  subtitle: string;
  error: string | null;
  busy: boolean;
  confirmLabel: string;
  canConfirm: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <h2 className="modal-title">{title}</h2>
        <p className="modal-sub">{subtitle}</p>

        {error && (
          <div className="feedback feedback-error form-alert" role="alert">
            <span className="feedback-dot" />
            <span>{error}</span>
          </div>
        )}

        {children}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Voltar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !canConfirm}
            onClick={() => void onConfirm()}
          >
            {busy ? 'Salvando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

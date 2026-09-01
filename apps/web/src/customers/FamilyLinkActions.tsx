import { useEffect, useRef, useState } from 'react';
import { CustomerPicker } from './CustomerPicker.js';
import { resolveFamilyActions, type FamilyActionId } from './familyActions.js';
import { useFamilyActions } from './useFamilyActions.js';
import type { FileCustomer, FileFamily } from './useCustomerFile.js';

/**
 * Reorganização de vínculo (CL-10) e merge de duplicados (CL-07) na ficha do cliente.
 * As três ações vivem num menu suspenso; cada uma abre um modal com a escolha e a
 * confirmação. Nenhuma regra aqui: o que fica disponível vem de `resolveFamilyActions`
 * e a decisão final é sempre do servidor.
 */

interface Props {
  readonly customer: FileCustomer;
  readonly family: FileFamily;
  readonly onChanged: () => void;
}

export function FamilyLinkActions({ customer, family, onChanged }: Props): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<FamilyActionId | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const actions = resolveFamilyActions({
    role: customer.role,
    companionCount: family.companions.length,
  });

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const finish = (message: string) => {
    setDialog(null);
    setDone(message);
    onChanged();
  };

  if (done) {
    return (
      <div className="invite-callout feedback feedback-info">
        <div className="token-callout-body">
          <span className="rowpanel-title">{done}</span>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDone(null)}>
          Ok
        </button>
      </div>
    );
  }

  return (
    <div className="link-actions" ref={ref}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        Vínculo
      </button>

      {menuOpen && (
        <div className="menu" role="menu">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              className="menu-item"
              disabled={!action.enabled}
              title={action.reason ?? undefined}
              onClick={() => {
                setMenuOpen(false);
                setDialog(action.id);
              }}
            >
              {action.label}
              {action.reason && <span className="menu-item-reason">{action.reason}</span>}
            </button>
          ))}
        </div>
      )}

      {dialog === 'move' && (
        <MoveDialog
          customer={customer}
          family={family}
          onClose={() => setDialog(null)}
          onDone={finish}
        />
      )}
      {dialog === 'promote' && (
        <PromoteDialog
          customer={customer}
          family={family}
          onClose={() => setDialog(null)}
          onDone={finish}
        />
      )}
      {dialog === 'merge' && (
        <MergeDialog customer={customer} onClose={() => setDialog(null)} onDone={finish} />
      )}
    </div>
  );
}

function MoveDialog({
  customer,
  family,
  onClose,
  onDone,
}: {
  customer: FileCustomer;
  family: FileFamily;
  onClose: () => void;
  onDone: (message: string) => void;
}): React.JSX.Element {
  const { busy, move } = useFamilyActions(customer.id);
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!target) return;
    const result = await move(target);
    if (result.ok) onDone(`${customer.fullName} agora é acompanhante da família escolhida.`);
    else setError(result.message);
  };

  // Já ser acompanhante do responsável atual não é destino; o próprio cliente também não.
  const exclude = [customer.id, ...(family.responsible ? [family.responsible.id] : [])];

  return (
    <Dialog
      title="Vincular a outra família"
      subtitle={`${customer.fullName} passa a ser acompanhante do responsável escolhido.`}
      error={error}
      busy={busy}
      confirmLabel="Vincular"
      canConfirm={Boolean(target)}
      onClose={onClose}
      onConfirm={submit}
    >
      <CustomerPicker
        mode="responsibles"
        excludeIds={exclude}
        selectedId={target}
        onSelect={(id) => {
          setError(null);
          setTarget(id);
        }}
      />
    </Dialog>
  );
}

function PromoteDialog({
  customer,
  family,
  onClose,
  onDone,
}: {
  customer: FileCustomer;
  family: FileFamily;
  onClose: () => void;
  onDone: (message: string) => void;
}): React.JSX.Element {
  const { busy, promote } = useFamilyActions(customer.id);
  const [bring, setBring] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setBring((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );

  const submit = async () => {
    const result = await promote(bring);
    if (result.ok) onDone(`${customer.fullName} agora é responsável da própria família.`);
    else setError(result.message);
  };

  return (
    <Dialog
      title="Tornar responsável"
      subtitle={`${customer.fullName} passa a formar a própria família.`}
      error={error}
      busy={busy}
      confirmLabel="Tornar responsável"
      canConfirm
      onClose={onClose}
      onConfirm={submit}
    >
      {family.companions.length === 0 ? (
        <p className="members-empty">Não há acompanhantes na família de origem para levar.</p>
      ) : (
        <>
          <span className="field-label">Levar acompanhantes</span>
          <div className="enroll-list pick-scroll">
            {family.companions.map((member) => (
              <label key={member.id} className="check-row">
                <input
                  type="checkbox"
                  className="check"
                  checked={bring.includes(member.id)}
                  onChange={() => toggle(member.id)}
                />
                <span className="check-name">{member.fullName}</span>
              </label>
            ))}
          </div>
          <span className="field-help">Quem não for marcado continua na família de origem.</span>
        </>
      )}
    </Dialog>
  );
}

function MergeDialog({
  customer,
  onClose,
  onDone,
}: {
  customer: FileCustomer;
  onClose: () => void;
  onDone: (message: string) => void;
}): React.JSX.Element {
  const { busy, merge } = useFamilyActions(customer.id);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!duplicate) return;
    const result = await merge(duplicate);
    if (result.ok) onDone(`Cadastros mesclados em ${customer.fullName}.`);
    else setError(result.message);
  };

  return (
    <Dialog
      title="Mesclar cadastro duplicado"
      subtitle={`O cadastro escolhido é removido e o histórico passa para ${customer.fullName}. Não dá para desfazer.`}
      error={error}
      busy={busy}
      confirmLabel="Mesclar cadastros"
      canConfirm={Boolean(duplicate)}
      onClose={onClose}
      onConfirm={submit}
    >
      <CustomerPicker
        mode="all"
        excludeIds={[customer.id]}
        selectedId={duplicate}
        onSelect={(id) => {
          setError(null);
          setDuplicate(id);
        }}
      />
    </Dialog>
  );
}

function Dialog({
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
      <div className="modal modal-lg">
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
            Cancelar
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

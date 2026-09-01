import { useEffect, useMemo, useRef, useState } from 'react';
import { useCustomerFile, type CustomerFileView } from '../customers/useCustomerFile.js';
import { ExpeditionsTab, FinanceTab, CashbackTab } from '../customers/CustomerScreen.js';
import { usePortalActions, type ActionResult } from './usePortalActions.js';
import { usePortalFamily } from './usePortalBrowse.js';
import { ConsentsCard } from './ConsentsCard.js';
import { brDateToIso } from '../customers/dateFields.js';
import { useMediaConsent } from '../community/useMediaConsent.js';
import {
  VehicleFields,
  sameVehicle,
  EMPTY_VEHICLE_DRAFT,
  type VehicleDraft,
} from '../customers/VehicleFields.js';
import { useFamilyVehicles, type VehicleDto } from '../customers/useFamilyVehicles.js';

/**
 * "Minha conta" no portal (§3.7), em quatro sub-abas. **Meus dados** é um card único: o
 * responsável, depois cada acompanhante (com "Adicionar acompanhante"), depois o veículo da
 * família, e um único "Salvar". Só o **contato** (e-mail/telefone) é editável pelo cliente;
 * **nome, nascimento e CPF são bloqueados** — identidade só a equipe altera, mediante
 * solicitação. As outras abas: Notificações, Histórico de expedições e Histórico financeiro.
 */

type ContaTab = 'dados' | 'notificacoes' | 'privacidade' | 'expedicoes' | 'financeiro';

const CONTA_TABS: readonly { id: ContaTab; label: string }[] = [
  { id: 'dados', label: 'Meus dados' },
  { id: 'notificacoes', label: 'Notificações' },
  { id: 'privacidade', label: 'Privacidade' },
  { id: 'expedicoes', label: 'Histórico de expedições' },
  { id: 'financeiro', label: 'Histórico financeiro' },
];

export function PortalContaScreen({ customerId }: { customerId: string }): React.JSX.Element {
  const { state, refresh } = useCustomerFile(customerId);
  const [tab, setTab] = useState<ContaTab>('dados');
  const [famKey, setFamKey] = useState(0);
  const onChanged = () => {
    refresh();
    setFamKey((k) => k + 1);
  };

  return (
    <div className="page page-wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Minha conta</h1>
          <p className="page-meta">Seus dados, notificações e os históricos de expedição.</p>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Seções da conta">
        {CONTA_TABS.map((t) => (
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

      {state.status === 'loading' && <p className="members-empty">Carregando…</p>}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar a conta</span>
            <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' &&
        (tab === 'dados' ? (
          <MeusDadosCard key={famKey} responsavel={state.file.customer} onChanged={onChanged} />
        ) : tab === 'notificacoes' ? (
          <ConsentsCard customerId={customerId} />
        ) : tab === 'privacidade' ? (
          <PrivacidadeTab customerId={customerId} />
        ) : tab === 'expedicoes' ? (
          <ExpeditionsTab expeditions={state.file.expeditions} />
        ) : (
          <>
            <FinanceTab expeditions={state.file.expeditions} />
            <CashbackTab cashback={state.file.cashback} />
          </>
        ))}
    </div>
  );
}

interface Member {
  id: string;
  fullName: string;
  birthDate: string;
  email: string | null;
  phone: string | null;
  role: 'responsible' | 'companion';
}

/** Espera a família carregar e então monta o form completo (estado inicial de uma vez). */
function MeusDadosCard({
  responsavel,
  onChanged,
}: {
  responsavel: CustomerFileView['customer'];
  onChanged: () => void;
}): React.JSX.Element {
  const family = usePortalFamily();

  if (family === null) {
    return (
      <div className="card">
        <div className="panel-head">
          <h2 className="card-title">Meus dados</h2>
        </div>
        <p className="members-empty">Carregando…</p>
      </div>
    );
  }

  const members: Member[] = [
    {
      id: responsavel.id,
      fullName: responsavel.fullName,
      birthDate: responsavel.birthDate,
      email: responsavel.email,
      phone: responsavel.phone,
      role: 'responsible',
    },
    ...family
      .filter((m) => m.role === 'companion' && m.id !== responsavel.id)
      .map((m) => ({
        id: m.id,
        fullName: m.fullName,
        birthDate: m.birthDate,
        email: m.email,
        phone: m.phone,
        role: 'companion' as const,
      })),
  ];

  return <MeusDadosForm responsavelId={responsavel.id} members={members} onChanged={onChanged} />;
}

function MeusDadosForm({
  responsavelId,
  members,
  onChanged,
}: {
  responsavelId: string;
  members: Member[];
  onChanged: () => void;
}): React.JSX.Element {
  const actions = usePortalActions();
  // Só contato é editável pelo cliente. Nome, nascimento e CPF são identidade: só a equipe
  // altera. Deltas por membro; ausente = ainda não tocado (usa o valor original via `editOf`).
  const [edits, setEdits] = useState<Record<string, { email: string; phone: string }>>({});
  const [vehicle, setVehicle] = useState<VehicleDraft>(EMPTY_VEHICLE_DRAFT);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'go' | 'no'; text: string } | null>(null);

  // O carro que a família já tem: o formulário abre com ele preenchido, e salvar edita
  // esse mesmo veículo em vez de anexar um segundo (a placa é única por tenant).
  const { vehicles, update, create, refresh: refreshVehicles } = useFamilyVehicles(responsavelId);
  const current = vehicles?.[0] ?? null;
  const originalVehicle = useMemo(() => toDraft(current), [current]);
  // Sincroniza quando **outro** veículo chega (carregou, ou o primeiro foi criado). Não a
  // cada resposta do servidor: o fetch inicial pode terminar depois que o cliente já
  // começou a digitar, e apagar o que ele escreveu seria pior do que não pré-carregar.
  const syncedVehicleId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (vehicles === null) return;
    const id = vehicles[0]?.id ?? null;
    if (syncedVehicleId.current === id) return;
    syncedVehicleId.current = id;
    setVehicle(toDraft(vehicles[0] ?? null));
  }, [vehicles]);

  const editOf = (m: Member): { email: string; phone: string } =>
    edits[m.id] ?? { email: m.email ?? '', phone: m.phone ?? '' };

  const setField = (m: Member, field: 'email' | 'phone', value: string) =>
    setEdits((prev) => ({ ...prev, [m.id]: { ...(prev[m.id] ?? editOf(m)), [field]: value } }));

  const memberDirty = (m: Member): boolean => {
    const e = editOf(m);
    return e.email.trim() !== (m.email ?? '').trim() || e.phone.trim() !== (m.phone ?? '').trim();
  };
  const vehicleDirty = !sameVehicle(vehicle, originalVehicle);
  const dirty = members.some(memberDirty) || vehicleDirty;

  const submit = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      for (const m of members) {
        const e = editOf(m);
        if (
          e.email.trim() !== (m.email ?? '').trim() ||
          e.phone.trim() !== (m.phone ?? '').trim()
        ) {
          const r = await actions.editContact(m.id, {
            email: e.email.trim() || undefined,
            phone: e.phone.trim() || undefined,
          });
          if (!r.ok) {
            setFeedback({ kind: 'no', text: `${m.fullName}: ${r.message}` });
            return;
          }
        }
      }
      if (vehicleDirty && vehicle.plate.trim() !== '') {
        const r = current
          ? await update(current.id, vehicle)
          : await create(responsavelId, vehicle);
        if (!r.ok) {
          setFeedback({ kind: 'no', text: r.message });
          return;
        }
        refreshVehicles();
      }
      setFeedback({ kind: 'go', text: 'Alterações salvas.' });
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="panel-head">
        <h2 className="card-title">Meus dados</h2>
      </div>
      <Feedback value={feedback} />

      <div className="member-editors">
        {members.map((m) => {
          const e = editOf(m);
          return (
            <div key={m.id} className="member-editor">
              <div className="family-head">
                <span className="avatar">{initials(m.fullName)}</span>
                <span className="result-grow">
                  <span className="result-name">{m.fullName}</span>
                </span>
                <span className="pill pill-neutral">
                  {m.role === 'responsible' ? 'Responsável' : 'Acompanhante'}
                </span>
              </div>
              <div className="form-grid">
                <label className="field field-wide">
                  <span className="field-label">Nome completo</span>
                  <input className="field-input" value={m.fullName} disabled />
                </label>
                <label className="field">
                  <span className="field-label">Nascimento</span>
                  {/* O DTO exibe dd/mm/aaaa; o campo de data fala ISO (CL-06). */}
                  <input
                    type="date"
                    className="field-input is-mono"
                    value={brDateToIso(m.birthDate)}
                    disabled
                  />
                </label>
                <label className="field">
                  <span className="field-label">E-mail</span>
                  <input
                    className="field-input"
                    value={e.email}
                    onChange={(ev) => setField(m, 'email', ev.target.value)}
                    inputMode="email"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Telefone</span>
                  <input
                    className="field-input is-mono"
                    value={e.phone}
                    onChange={(ev) => setField(m, 'phone', ev.target.value)}
                    inputMode="tel"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {adding ? (
        <div className="member-editor">
          <CompanionForm
            busy={actions.busy}
            onSubmit={(input) => actions.addCompanion(input)}
            onDone={() => {
              setAdding(false);
              onChanged();
            }}
          />
        </div>
      ) : (
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            Adicionar acompanhante
          </button>
        </div>
      )}

      <span className="field-label form-subhead vehicle-subhead">
        Veículo da família (opcional)
      </span>
      <VehicleFields value={vehicle} onChange={setVehicle} />

      <p className="field-help">
        Nome, data de nascimento e CPF são alterados apenas pela equipe, mediante solicitação. Você
        edita livremente o contato (e-mail e telefone).
      </p>

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !dirty}
          onClick={() => void submit()}
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

function CompanionForm({
  busy,
  onSubmit,
  onDone,
}: {
  busy: boolean;
  onSubmit: (input: { fullName: string; cpf: string; birthDate: string }) => Promise<ActionResult>;
  onDone: () => void;
}): React.JSX.Element {
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'go' | 'no'; text: string } | null>(null);
  const valid =
    fullName.trim() !== '' && cpf.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(birthDate);

  const submit = async () => {
    const result = await onSubmit({ fullName: fullName.trim(), cpf: cpf.trim(), birthDate });
    if (result.ok) {
      setFeedback({ kind: 'go', text: 'Acompanhante adicionado.' });
      setFullName('');
      setCpf('');
      setBirthDate('');
      onDone();
    } else {
      setFeedback({ kind: 'no', text: result.message });
    }
  };

  return (
    <div className="portal-form">
      <Feedback value={feedback} />
      <div className="form-grid">
        <label className="field field-wide">
          <span className="field-label">Nome completo</span>
          <input
            className="field-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">CPF</span>
          <input
            className="field-input is-mono"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="field">
          <span className="field-label">Nascimento</span>
          <input
            type="date"
            className="field-input is-mono"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </label>
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !valid}
          onClick={() => void submit()}
        >
          Adicionar acompanhante
        </button>
      </div>
    </div>
  );
}

/** Privacidade (CO-10): consentimento de uso da imagem do cliente na comunidade. */
function PrivacidadeTab({ customerId }: { customerId: string }): React.JSX.Element {
  const { state, busy, setScope } = useMediaConsent(customerId);
  return (
    <div className="card">
      <div className="panel-head">
        <h2 className="card-title">Privacidade</h2>
      </div>
      <p className="field-help">Você controla como sua imagem aparece na comunidade.</p>
      <label className="switch-row">
        <span className="switch-label">
          <span className="rowpanel-title">Uso da minha imagem na comunidade</span>
          <span className="field-help">
            Autorizo que minhas fotos apareçam no feed. Posso revogar quando quiser.
          </span>
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={state?.community ?? false}
          disabled={busy || state === null}
          onChange={(e) => void setScope('community', e.target.checked)}
        />
      </label>
    </div>
  );
}

function Feedback({
  value,
}: {
  value: { kind: 'go' | 'no'; text: string } | null;
}): React.JSX.Element | null {
  if (!value) return null;
  return (
    <div className={`feedback ${value.kind === 'go' ? 'feedback-go' : 'feedback-error'}`}>
      <span className="feedback-dot" />
      <span>{value.text}</span>
    </div>
  );
}

/** O veículo salvo vira o rascunho do formulário; sem veículo, o rascunho é vazio. */
function toDraft(vehicle: VehicleDto | null): VehicleDraft {
  if (!vehicle) return EMPTY_VEHICLE_DRAFT;
  return {
    plate: vehicle.plate,
    brandId: vehicle.brandId,
    brandOther: vehicle.brandOther,
    modelId: vehicle.modelId,
    modelOther: vehicle.modelOther,
  };
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

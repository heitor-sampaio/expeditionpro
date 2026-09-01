import { useState } from 'react';
import { api } from '../auth/api.js';
import { useCustomerSearch, type FamilyDto } from '../customers/useCustomerSearch.js';

/**
 * Alocar família no grupo (GR-02/GR-03). Busca a família, exibe todos os membros e deixa
 * **escolher quais participam** — nem todos vão em toda saída. O responsável é o head da
 * família; os participantes são os marcados. A regra (snapshot de preço, IN-02) é do
 * servidor; aqui é só seleção. Fecha e dá refresh no board ao alocar.
 */
export function AllocatePanel({
  groupId,
  onAllocated,
}: {
  groupId: string;
  onAllocated: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="allocate-bar">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          Alocar família
        </button>
      </div>
    );
  }
  return (
    <section className="allocate-panel card">
      <div className="panel-head">
        <h2 className="card-title">Alocar família no grupo</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
          Fechar
        </button>
      </div>
      <AllocateSearch
        groupId={groupId}
        onAllocated={() => {
          setOpen(false);
          onAllocated();
        }}
      />
    </section>
  );
}

function AllocateSearch({
  groupId,
  onAllocated,
}: {
  groupId: string;
  onAllocated: () => void;
}): React.JSX.Element {
  const { query, setQuery, state } = useCustomerSearch();
  const [picked, setPicked] = useState<FamilyDto | null>(null);

  if (picked) {
    return (
      <FamilyAllocation
        groupId={groupId}
        family={picked}
        onBack={() => setPicked(null)}
        onAllocated={onAllocated}
      />
    );
  }

  return (
    <>
      <input
        className="field-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nome ou CPF"
        aria-label="Buscar família"
        inputMode="search"
      />
      {state.status === 'loading' && <p className="members-empty">Buscando…</p>}
      {state.status === 'error' && (
        <p className="field-error">Não deu para buscar. Tente de novo.</p>
      )}
      {state.status === 'ready' && state.families.length === 0 && (
        <p className="members-empty">Nada bate com “{query}”.</p>
      )}
      {state.status === 'ready' && state.families.length > 0 && (
        <div className="allocate-results">
          {state.families.map((family) => (
            <button
              key={family.responsible.id}
              type="button"
              className="allocate-result"
              onClick={() => setPicked(family)}
            >
              <span className="result-name">{family.responsible.fullName}</span>
              <span className="result-sub">
                {family.responsible.cpf} · {family.companions.length + 1} pessoas
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function FamilyAllocation({
  groupId,
  family,
  onBack,
  onAllocated,
}: {
  groupId: string;
  family: FamilyDto;
  onBack: () => void;
  onAllocated: () => void;
}): React.JSX.Element {
  const members = [family.responsible, ...family.companions];
  const [selected, setSelected] = useState<Set<string>>(new Set(members.map((m) => m.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allocate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api(`/v1/groups/${groupId}/bookings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          responsibleCustomerId: family.responsible.id,
          participantCustomerIds: [...selected],
        }),
      });
      if (!res.ok) {
        const parsed = (await res.json().catch(() => ({}))) as { error?: string };
        setError(messageFor(parsed.error, res.status));
        return;
      }
      onAllocated();
    } catch {
      setError('Falha de conexão.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="allocate-family">
      <div className="allocate-head">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
          ‹ Outra família
        </button>
        <span className="allocate-name">{family.responsible.fullName}</span>
      </div>

      {error && (
        <div className="feedback feedback-error">
          <span className="feedback-dot" />
          <span>{error}</span>
        </div>
      )}

      <p className="field-help">Marque quem participa desta saída.</p>
      <div className="members">
        {members.map((member) => (
          <label key={member.id} className="member member-select">
            <input
              type="checkbox"
              checked={selected.has(member.id)}
              onChange={() => toggle(member.id)}
            />
            <span className="result-grow">
              <span className="member-name">{member.fullName}</span>
              <span className="member-cpf">
                {member.cpf} · {member.role === 'responsible' ? 'responsável' : 'acompanhante'}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || selected.size === 0}
          onClick={() => void allocate()}
        >
          {busy ? 'Alocando…' : `Alocar ${selected.size} no grupo`}
        </button>
      </div>
    </div>
  );
}

function messageFor(code: string | undefined, status: number): string {
  if (code === 'already_allocated') return 'Esta família já tem inscrição neste grupo.';
  if (code === 'no_price_for_group_date') return 'O roteiro não tem preço para a data do grupo.';
  if (status === 401 || status === 403) return 'Seu perfil não permite alocar.';
  if (status === 400 || status === 422) return 'Confira os dados antes de alocar.';
  return 'Não foi possível alocar. Tente de novo.';
}

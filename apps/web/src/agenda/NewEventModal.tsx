import { useState } from 'react';
import { useItineraries } from './useItineraries.js';
import type { NewEventInput } from './useScheduleEvents.js';

/**
 * Modal de novo evento (AG-02). Escolhe o roteiro e as datas; o servidor cria o evento
 * e o grupo na mesma transação. Só render + chamada — a regra é toda do backend.
 */

interface Props {
  /** Dia clicado no calendário: início e término já vêm preenchidos com ele (AG-02). */
  readonly initialDate?: string | undefined;
  readonly onClose: () => void;
  readonly onCreate: (
    input: NewEventInput,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
}

export function NewEventModal({ initialDate, onClose, onCreate }: Props): React.JSX.Element {
  const itineraries = useItineraries(true);
  const [itineraryId, setItineraryId] = useState('');
  const [startDate, setStartDate] = useState(initialDate ?? '');
  const [endDate, setEndDate] = useState(initialDate ?? '');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = itineraryId !== '' && startDate !== '' && endDate !== '' && !saving;

  const submit = async () => {
    setError(null);
    setSaving(true);
    const input: NewEventInput = { itineraryId, startDate, endDate };
    if (title.trim() !== '') input.title = title.trim();
    const result = await onCreate(input);
    setSaving(false);
    if (result.ok) {
      onClose();
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Novo evento">
      <div className="modal">
        <h2 className="modal-title">Novo evento</h2>

        {error && (
          <div className="feedback feedback-error form-alert">
            <span className="feedback-dot" />
            <span>{error}</span>
          </div>
        )}

        <div className="form-grid">
          <label className="field field-full">
            <span className="field-label">Roteiro</span>
            <select
              className="field-input"
              value={itineraryId}
              onChange={(e) => setItineraryId(e.target.value)}
              disabled={itineraries.status !== 'ready'}
            >
              <option value="">
                {itineraries.status === 'loading' ? 'Carregando…' : 'Selecione o roteiro'}
              </option>
              {itineraries.status === 'ready' &&
                itineraries.itineraries.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                  </option>
                ))}
            </select>
            {itineraries.status === 'error' && (
              <span className="field-error">Não foi possível carregar os roteiros.</span>
            )}
          </label>

          <label className="field">
            <span className="field-label">Início</span>
            <input
              type="date"
              className="field-input is-mono"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Término</span>
            <input
              type="date"
              className="field-input is-mono"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>

          <label className="field field-full">
            <span className="field-label">Título (opcional)</span>
            <input
              className="field-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome derivado do roteiro e da data se em branco"
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSave}
            onClick={() => void submit()}
          >
            {saving ? 'Criando…' : 'Criar evento'}
          </button>
        </div>
      </div>
    </div>
  );
}

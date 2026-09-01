import { useState } from 'react';
import { ItineraryCover } from './ItineraryCover.js';
import {
  ItineraryMetaFields,
  PriceFieldset,
  pricesOf,
  STATUS_LABEL,
  type MetaState,
  type Result,
} from './itineraryForm.js';
import { useItinerariesAdmin, type ItineraryDto, type PriceInput } from './useItinerariesAdmin.js';

/**
 * Roteiros (RO-01..03): o índice dos produtos (Coxilha Rica, Vale Europeu…) em cards com a
 * capa escolhida. Criar abre o modal (faixas + primeiro preço); clicar num card abre a página
 * do roteiro, onde vive toda a edição. Cinco estados; sem lógica de negócio, só render + chamada.
 */

export function RoteirosScreen({
  onOpenItinerary,
}: {
  onOpenItinerary: (id: string) => void;
}): React.JSX.Element {
  const { state, refresh, createItinerary } = useItinerariesAdmin();
  const [newOpen, setNewOpen] = useState(false);

  return (
    <main className="page page-wide">
      <div className="page-header page-header-row">
        <div>
          <h1 className="page-title">Roteiros</h1>
          <p className="page-meta">Os produtos da operação — faixas etárias e preço por versão.</p>
        </div>
        <div className="state-grow" />
        <button type="button" className="btn btn-primary" onClick={() => setNewOpen(true)}>
          Novo roteiro
        </button>
      </div>

      {state.status === 'loading' && <CardsSkeleton />}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar os roteiros</span>
            <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' && state.itineraries.length === 0 && (
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">Nenhum roteiro ainda</span>
            <span className="state-line">Crie o primeiro para poder abrir eventos na agenda.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-primary" onClick={() => setNewOpen(true)}>
            Novo roteiro
          </button>
        </div>
      )}

      {state.status === 'ready' && state.itineraries.length > 0 && (
        <div className="rot-card-grid">
          {state.itineraries.map((it) => (
            <ItineraryCard key={it.id} itinerary={it} onOpen={() => onOpenItinerary(it.id)} />
          ))}
        </div>
      )}

      {newOpen && (
        <NewItineraryModal onClose={() => setNewOpen(false)} onCreate={createItinerary} />
      )}
    </main>
  );
}

function ItineraryCard({
  itinerary,
  onOpen,
}: {
  itinerary: ItineraryDto;
  onOpen: () => void;
}): React.JSX.Element {
  return (
    <button type="button" className="rot-card" onClick={onOpen}>
      <ItineraryCover coverPath={itinerary.coverPath} />
      <div className="rot-card-body">
        <span className="rot-card-name">{itinerary.name}</span>
        <span className={`pill pill-${itinerary.status === 'active' ? 'go' : 'neutral'}`}>
          {STATUS_LABEL[itinerary.status] ?? itinerary.status}
        </span>
      </div>
    </button>
  );
}

function NewItineraryModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: {
    name: string;
    description?: string;
    difficulty?: string;
    childYoungMaxAge?: number;
    childMidMaxAge?: number;
    prices: PriceInput;
  }) => Promise<Result>;
}): React.JSX.Element {
  const [meta, setMeta] = useState<MetaState>({
    name: '',
    difficulty: '',
    youngMax: '5',
    midMax: '10',
    description: '',
  });
  const [validFrom, setValidFrom] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setField = <K extends keyof MetaState>(key: K, value: MetaState[K]) =>
    setMeta((m) => ({ ...m, [key]: value }));

  const canSave = meta.name.trim() !== '' && validFrom !== '' && !saving;

  const submit = async () => {
    setError(null);
    setSaving(true);
    const input: {
      name: string;
      description?: string;
      difficulty?: string;
      childYoungMaxAge?: number;
      childMidMaxAge?: number;
      prices: PriceInput;
    } = { name: meta.name.trim(), prices: pricesOf(prices, validFrom) };
    if (meta.description.trim()) input.description = meta.description.trim();
    if (meta.difficulty) input.difficulty = meta.difficulty;
    if (meta.youngMax) input.childYoungMaxAge = Number(meta.youngMax);
    if (meta.midMax) input.childMidMaxAge = Number(meta.midMax);
    const result = await onCreate(input);
    setSaving(false);
    if (result.ok) onClose();
    else setError(result.message);
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Novo roteiro">
      <div className="modal modal-lg">
        <h2 className="modal-title">Novo roteiro</h2>
        {error && (
          <div className="feedback feedback-error form-alert">
            <span className="feedback-dot" />
            <span>{error}</span>
          </div>
        )}
        <div className="form-grid">
          <ItineraryMetaFields meta={meta} set={setField} />
          <div className="form-divider">Preço inicial</div>
          <label className="field">
            <span className="field-label">Vigente a partir de</span>
            <input
              type="date"
              className="field-input is-mono"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </label>
          <PriceFieldset values={prices} set={(k, v) => setPrices((p) => ({ ...p, [k]: v }))} />
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
            {saving ? 'Criando…' : 'Criar roteiro'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardsSkeleton(): React.JSX.Element {
  return (
    <div className="rot-card-grid" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="rot-card is-skeleton">
          <div className="rot-card-cover rot-card-cover-empty" />
          <div className="rot-card-body">
            <span className="skel-line" />
            <span className="skel-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}

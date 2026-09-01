import { useEffect, useState } from 'react';
import { PhotoGallery, type PhotoItem } from './PhotoGallery.js';
import { removeImages } from '../ui/uploadImages.js';
import {
  ItineraryMetaFields,
  PriceFieldset,
  STATUS_LABEL,
  pricesOf,
  valuesFromCents,
  type MetaState,
  type Result,
} from './itineraryForm.js';
import {
  useItinerariesAdmin,
  type ItineraryDto,
  type ItineraryPhotoSave,
  type PriceInput,
  type PriceVersionDto,
  type UpdateItineraryInput,
} from './useItinerariesAdmin.js';
import { useScheduleEvents, type ScheduleEventDto } from '../agenda/useScheduleEvents.js';
import { brl } from '../ui/money.js';

/**
 * Página do roteiro (RO-01/02): toda a edição num só lugar — metadados, descrição markdown,
 * situação, fotos (com capa) e reajuste de preço — e, no fim, o histórico de realizações
 * daquela expedição. Clicar numa realização abre o controle do grupo. Sem lógica de negócio.
 */

const GROUP_STATUS: Record<string, { label: string; tone: 'go' | 'no' | 'neutral' }> = {
  draft: { label: 'rascunho', tone: 'neutral' },
  open: { label: 'aberto', tone: 'neutral' },
  closed: { label: 'fechado', tone: 'neutral' },
  in_progress: { label: 'em andamento', tone: 'neutral' },
  done: { label: 'realizada', tone: 'go' },
  cancelled: { label: 'cancelada', tone: 'no' },
};

export function ItineraryScreen({
  itineraryId,
  onBack,
  onOpenGroup,
}: {
  itineraryId: string;
  onBack: () => void;
  onOpenGroup: (groupId: string) => void;
}): React.JSX.Element {
  const { state, updateItinerary, loadPhotos, savePhotos, loadPriceVersions, addPrice } =
    useItinerariesAdmin();

  if (state.status === 'loading') {
    return (
      <main className="page page-wide">
        <div className="card form-card" aria-hidden>
          <div className="skel-bars">
            <div className="skel-bar" />
            <div className="skel-bar short" />
          </div>
        </div>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="page page-wide">
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar o roteiro</span>
            <span className="state-line is-error">Verifique a conexão e volte a tentar.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            Voltar aos roteiros
          </button>
        </div>
      </main>
    );
  }

  const itinerary = state.itineraries.find((i) => i.id === itineraryId) ?? null;
  if (!itinerary) {
    return (
      <main className="page page-wide">
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">Roteiro não encontrado</span>
            <span className="state-line">Pode ter sido removido ou o link está velho.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            Voltar aos roteiros
          </button>
        </div>
      </main>
    );
  }

  return (
    <ItineraryEditor
      key={itinerary.id}
      itinerary={itinerary}
      onBack={onBack}
      onOpenGroup={onOpenGroup}
      onUpdate={(input) => updateItinerary(itinerary.id, input)}
      loadPhotos={() => loadPhotos(itinerary.id)}
      savePhotos={(photos) => savePhotos(itinerary.id, photos)}
      loadPriceVersions={() => loadPriceVersions(itinerary.id)}
      onAddPrice={(prices) => addPrice(itinerary.id, prices)}
    />
  );
}

function ItineraryEditor({
  itinerary,
  onBack,
  onOpenGroup,
  onUpdate,
  loadPhotos,
  savePhotos,
  loadPriceVersions,
  onAddPrice,
}: {
  itinerary: ItineraryDto;
  onBack: () => void;
  onOpenGroup: (groupId: string) => void;
  onUpdate: (input: UpdateItineraryInput) => Promise<Result>;
  loadPhotos: () => Promise<{ storagePath: string; isCover: boolean }[]>;
  savePhotos: (photos: ItineraryPhotoSave[]) => Promise<Result>;
  loadPriceVersions: () => Promise<PriceVersionDto[]>;
  onAddPrice: (prices: PriceInput) => Promise<Result>;
}): React.JSX.Element {
  const [meta, setMeta] = useState<MetaState>({
    name: itinerary.name,
    difficulty: itinerary.difficulty ?? '',
    youngMax: String(itinerary.childYoungMaxAge),
    midMax: String(itinerary.childMidMaxAge),
    description: itinerary.description ?? '',
  });
  const [status, setStatus] = useState(itinerary.status);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  // O que estava salvo quando a página abriu (ou no último save): o que sumir daqui é
  // arquivo a apagar do Storage.
  const [savedPaths, setSavedPaths] = useState<string[]>([]);
  const [versions, setVersions] = useState<PriceVersionDto[]>([]);
  const [priceValues, setPriceValues] = useState<Record<string, string>>({});
  const [validFrom, setValidFrom] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // A versão vigente (maior valid_from) é a base dos campos e da detecção de reajuste.
  const currentVersion = latestVersion(versions);

  useEffect(() => {
    let alive = true;
    void loadPhotos().then((loaded) => {
      if (!alive) return;
      setPhotos(loaded.map((p) => ({ storagePath: p.storagePath, isCover: p.isCover })));
      setSavedPaths(loaded.map((p) => p.storagePath));
    });
    void loadPriceVersions().then((loaded) => {
      if (!alive) return;
      setVersions(loaded);
      const current = latestVersion(loaded);
      if (current) setPriceValues(valuesFromCents(current));
    });
    return () => {
      alive = false;
    };
    // Carrega galeria + histórico de preço uma vez ao abrir a página.
  }, []);

  const setField = <K extends keyof MetaState>(key: K, value: MetaState[K]) =>
    setMeta((m) => ({ ...m, [key]: value }));

  const canSave = meta.name.trim() !== '' && !saving;
  const priceChanged = priceDiffers(pricesOf(priceValues, ''), currentVersion);

  const submit = async () => {
    setFeedback(null);
    // O reajuste cria uma versão nova por valid_from — sem data não há como versionar.
    if (priceChanged && validFrom === '') {
      setFeedback({ tone: 'error', text: 'Para reajustar o preço, informe a data de vigência.' });
      return;
    }
    setSaving(true);
    const result = await onUpdate({
      name: meta.name.trim(),
      description: meta.description.trim(),
      difficulty: meta.difficulty,
      status,
      childYoungMaxAge: Number(meta.youngMax),
      childMidMaxAge: Number(meta.midMax),
    });
    if (!result.ok) {
      setSaving(false);
      setFeedback({ tone: 'error', text: result.message });
      return;
    }
    const photosResult = await savePhotos(
      photos.map((p) => ({ storagePath: p.storagePath, isCover: p.isCover })),
    );
    if (!photosResult.ok) {
      setSaving(false);
      setFeedback({ tone: 'error', text: photosResult.message });
      return;
    }
    // Só depois de o servidor aceitar a nova galeria: apagar antes deixaria foto quebrada
    // se o save falhasse. Falha ao apagar não desfaz o save — o registro é o que manda.
    const keep = new Set(photos.map((p) => p.storagePath));
    const dropped = savedPaths.filter((path) => !keep.has(path));
    if (dropped.length > 0) {
      try {
        await removeImages(dropped, 'itineraries');
      } catch {
        // arquivo órfão no bucket é ruído, não erro de negócio: não interrompe o save
      }
    }
    setSavedPaths([...keep]);
    if (priceChanged) {
      const priceResult = await onAddPrice(pricesOf(priceValues, validFrom));
      if (!priceResult.ok) {
        setSaving(false);
        setFeedback({ tone: 'error', text: priceResult.message });
        return;
      }
      const reloaded = await loadPriceVersions();
      setVersions(reloaded);
      const current = latestVersion(reloaded);
      if (current) setPriceValues(valuesFromCents(current));
      setValidFrom('');
    }
    setSaving(false);
    setFeedback({
      tone: 'ok',
      text: priceChanged ? 'Roteiro salvo e preço reajustado.' : 'Roteiro salvo.',
    });
  };

  return (
    <main className="page page-wide">
      <div className="page-header page-header-row">
        <div className="rot-head">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
            ‹ Roteiros
          </button>
          <div>
            <h1 className="page-title">{itinerary.name}</h1>
            <p className="page-meta">
              <span className={`pill pill-${status === 'active' ? 'go' : 'neutral'}`}>
                {STATUS_LABEL[status] ?? status}
              </span>
            </p>
          </div>
        </div>
        <div className="state-grow" />
      </div>

      <div className="card form-card">
        {feedback && (
          <div
            className={`feedback ${feedback.tone === 'ok' ? 'feedback-go' : 'feedback-error'} form-alert`}
            role={feedback.tone === 'error' ? 'alert' : 'status'}
          >
            <span className="feedback-dot" />
            <span>{feedback.text}</span>
          </div>
        )}
        <div className="form-grid">
          <ItineraryMetaFields meta={meta} set={setField} />
          <label className="field">
            <span className="field-label">Situação</span>
            <select
              className="field-input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div className="form-divider">Preço</div>
          <PriceFieldset
            values={priceValues}
            set={(k, v) => setPriceValues((p) => ({ ...p, [k]: v }))}
          />
          <label className="field field-full">
            <span className="field-label">
              {priceChanged ? 'Novo preço vigente a partir de' : 'Vigente a partir de'}
            </span>
            <input
              type="date"
              className="field-input is-mono"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
            <span className="field-help">
              Alterar um valor cria uma nova versão nessa data. Reajuste nunca altera inscrição já
              feita.
            </span>
          </label>

          <div className="field field-full">
            <span className="field-label">Fotos</span>
            <PhotoGallery photos={photos} onChange={setPhotos} />
          </div>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSave}
            onClick={() => void submit()}
          >
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </div>

      <PrecoHistorico versions={versions} />

      <RealizacoesSection itineraryId={itinerary.id} onOpenGroup={onOpenGroup} />
    </main>
  );
}

/** A versão vigente é a de maior valid_from (o último reajuste). */
function latestVersion(versions: PriceVersionDto[]): PriceVersionDto | null {
  if (versions.length === 0) return null;
  return versions.reduce((a, b) => (a.validFrom >= b.validFrom ? a : b));
}

/** Houve reajuste? Compara os cinco valores do formulário com a versão vigente. */
function priceDiffers(next: PriceInput, current: PriceVersionDto | null): boolean {
  if (!current) {
    return (
      next.coupleCents > 0 ||
      next.soloCents > 0 ||
      next.extraAdultCents > 0 ||
      next.childMidCents > 0 ||
      next.childYoungCents > 0
    );
  }
  return (
    next.coupleCents !== current.coupleCents ||
    next.soloCents !== current.soloCents ||
    next.extraAdultCents !== current.extraAdultCents ||
    next.childMidCents !== current.childMidCents ||
    next.childYoungCents !== current.childYoungCents
  );
}

function PrecoHistorico({ versions }: { versions: PriceVersionDto[] }): React.JSX.Element {
  const rows = [...versions].sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));

  return (
    <section className="rot-section">
      <h2 className="rot-section-title">Histórico de reajustes</h2>
      <p className="rot-section-sub">Cada versão de preço, por data de vigência.</p>

      {rows.length === 0 ? (
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">Sem preço registrado</span>
          </div>
        </div>
      ) : (
        <div className="card table-wrap">
          {rows.map((v, i) => (
            <div key={v.id} className="rot-price-ver">
              <span className="rot-price-date is-mono">
                {i === 0 ? 'atual · ' : ''}
                {formatDay(v.validFrom)}
              </span>
              <div className="rot-price-vals">
                <PriceChip label="casal" cents={v.coupleCents} />
                <PriceChip label="solo" cents={v.soloCents} />
                <PriceChip label="adulto+" cents={v.extraAdultCents} />
                <PriceChip label="cça maior" cents={v.childMidCents} />
                <PriceChip label="cça menor" cents={v.childYoungCents} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PriceChip({ label, cents }: { label: string; cents: number }): React.JSX.Element {
  return (
    <span className="rot-price-chip">
      <span className="rot-price-chip-label">{label}</span>
      <span className="rot-price-chip-val is-mono">R$ {brl(cents)}</span>
    </span>
  );
}

/** "2025-06-01" → "01 jun 2025". */
function formatDay(iso: string): string {
  const p = parts(iso);
  const MONTHS = [
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
  return `${String(p.day).padStart(2, '0')} ${MONTHS[p.month - 1]} ${p.year}`;
}

function RealizacoesSection({
  itineraryId,
  onOpenGroup,
}: {
  itineraryId: string;
  onOpenGroup: (groupId: string) => void;
}): React.JSX.Element {
  const { state } = useScheduleEvents();

  return (
    <section className="rot-section">
      <h2 className="rot-section-title">Histórico de realizações</h2>
      <p className="rot-section-sub">Cada vez que essa expedição foi para o calendário.</p>

      {state.status === 'loading' && (
        <div className="card table-wrap" aria-hidden>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rot-realiz">
              <span className="skel-line short" />
              <span className="skel-line" />
            </div>
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar o histórico</span>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <RealizacoesList
          events={state.events}
          itineraryId={itineraryId}
          onOpenGroup={onOpenGroup}
        />
      )}
    </section>
  );
}

function RealizacoesList({
  events,
  itineraryId,
  onOpenGroup,
}: {
  events: ScheduleEventDto[];
  itineraryId: string;
  onOpenGroup: (groupId: string) => void;
}): React.JSX.Element {
  const rows = events
    .filter((e) => e.itineraryId === itineraryId)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  if (rows.length === 0) {
    return (
      <div className="state" role="status">
        <div className="state-text">
          <span className="state-title">Ainda não foi realizada</span>
          <span className="state-line">Abra uma data na agenda para começar o histórico.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card table-wrap">
      {rows.map((row) => {
        const gs = GROUP_STATUS[row.group.status] ?? { label: row.group.status, tone: 'neutral' };
        return (
          <button
            key={row.id}
            type="button"
            className="rot-realiz"
            onClick={() => onOpenGroup(row.group.id)}
          >
            <span className="rot-realiz-date is-mono">
              {formatRange(row.startDate, row.endDate)}
            </span>
            <span className="rot-realiz-name">{row.group.name}</span>
            <span className="rot-realiz-occ is-mono">
              {row.occupancy.confirmedCount} confirmada
              {row.occupancy.confirmedCount === 1 ? '' : 's'}
              {row.occupancy.pendingCount > 0 ? ` · ${row.occupancy.pendingCount} pendente` : ''}
            </span>
            <span className={`pill pill-${gs.tone}`}>{gs.label}</span>
            <span className="rot-realiz-go" aria-hidden>
              ›
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Datas YYYY-MM-DD → "12–15 mar 2026" (mês abreviado em pt-BR, sem fuso). */
function formatRange(start: string, end: string): string {
  const s = parts(start);
  const e = parts(end);
  const MONTHS = [
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
  if (start === end) return `${s.day} ${MONTHS[s.month - 1]} ${s.year}`;
  if (s.month === e.month && s.year === e.year) {
    return `${s.day}–${e.day} ${MONTHS[s.month - 1]} ${s.year}`;
  }
  return `${s.day} ${MONTHS[s.month - 1]} – ${e.day} ${MONTHS[e.month - 1]} ${e.year}`;
}

function parts(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y ?? 0, month: m ?? 1, day: d ?? 1 };
}

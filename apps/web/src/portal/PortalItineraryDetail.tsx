import { useState } from 'react';
import { useItinerariesAdmin } from '../itineraries/useItinerariesAdmin.js';
import { ItineraryGallery } from '../itineraries/ItineraryGallery.js';
import { ItineraryPrices } from '../itineraries/ItineraryPrices.js';
import { RichText } from '../community/RichText.js';
import { usePortalExpeditions, usePortalFamily, type Expedition } from './usePortalBrowse.js';
import { EnrollModal } from './EnrollModal.js';
import { FamilyBudgetCard } from './FamilyBudgetCard.js';
import { useItineraryPrices } from '../itineraries/useItineraryPrices.js';
import { formatDateRange } from './format.js';

/**
 * O roteiro visto pelo cliente (RO-01, só leitura): capa, nome, dificuldade, descrição e
 * as saídas marcadas. É conteúdo puro (sem casca de página), montado pela
 * `PortalItineraryScreen`.
 */
export function PortalItineraryDetail({
  itineraryId,
}: {
  readonly itineraryId: string;
}): React.JSX.Element {
  const { state, refresh } = useItinerariesAdmin();
  const { state: vitrine, refresh: refreshVitrine } = usePortalExpeditions();
  const family = usePortalFamily();
  const [enrollFor, setEnrollFor] = useState<Expedition | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const pricesState = useItineraryPrices(itineraryId);

  const itinerary =
    state.status === 'ready' ? state.itineraries.find((i) => i.id === itineraryId) : undefined;
  const saidas =
    vitrine.status === 'ready'
      ? vitrine.expeditions.filter((e) => e.itineraryId === itineraryId)
      : [];

  if (state.status === 'loading') {
    return (
      <div className="skeleton" aria-hidden>
        <div className="skel-card">
          <div className="skel-bars">
            <div className="skel-bar" />
            <div className="skel-bar short" />
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="state" role="alert">
        <div className="state-text">
          <span className="state-title">Não deu para carregar o roteiro</span>
          <span className="state-line is-error">Tente de novo.</span>
        </div>
        <div className="state-grow" />
        <button type="button" className="btn btn-secondary" onClick={refresh}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!itinerary) {
    return (
      <div className="state" role="status">
        <div className="state-text">
          <span className="state-title">Roteiro não encontrado</span>
          <span className="state-line">Ele pode ter saído do catálogo.</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <ItineraryGallery itineraryId={itinerary.id} coverPath={itinerary.coverPath} />

      <div className="board-titlerow rot-detail-title">
        <h1 className="page-title">{itinerary.name}</h1>
        {itinerary.difficulty && (
          <span className={`pill ${difficultyPill(itinerary.difficulty)}`}>
            {itinerary.difficulty}
          </span>
        )}
      </div>

      <div className="rot-detail-desc">
        {itinerary.description ? (
          <RichText text={itinerary.description} mode="headings" />
        ) : (
          <p className="members-empty">Este roteiro ainda não tem descrição.</p>
        )}
      </div>

      <div className="dash-section-head is-tight">
        <h2 className="card-title">Valores</h2>
      </div>
      <ItineraryPrices
        itineraryId={itinerary.id}
        childYoungMaxAge={itinerary.childYoungMaxAge}
        childMidMaxAge={itinerary.childMidMaxAge}
      />

      {pricesState.status === 'ready' && family && (
        <FamilyBudgetCard
          members={family}
          prices={pricesState.prices}
          startDateIso={saidas[0]?.startDate ?? todayIso()}
          bands={{
            childYoungMaxAge: itinerary.childYoungMaxAge,
            childMidMaxAge: itinerary.childMidMaxAge,
          }}
          hasGroup={saidas.length > 0}
        />
      )}

      <div className="dash-section-head is-tight">
        <h2 className="card-title">Próximos grupos</h2>
      </div>

      {saidas.length === 0 ? (
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">Nenhum grupo aberto para este roteiro</span>
            <span className="state-line">Novas datas aparecem aqui quando abrirem.</span>
          </div>
        </div>
      ) : (
        <div className="exp-list">
          {saidas.map((exp, index) => (
            <article key={exp.groupId} className={`exp-card${index === 0 ? ' is-next' : ''}`}>
              <div className="exp-main">
                <span className="exp-name">{exp.itineraryName}</span>
                <span className="exp-dates">{formatDateRange(exp.startDate, exp.endDate)}</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm btn-ico"
                onClick={() => setEnrollFor(exp)}
              >
                <PlusIcon />
                Inscrever-se
              </button>
            </article>
          ))}
        </div>
      )}

      {done && (
        <div className="feedback feedback-go">
          <span className="feedback-dot" />
          <span>{done}</span>
        </div>
      )}

      {enrollFor && (
        <EnrollModal
          expedition={enrollFor}
          family={family}
          onClose={() => setEnrollFor(null)}
          onDone={(name) => {
            setEnrollFor(null);
            setDone(
              `Inscrição enviada para ${name}. Confirme o pagamento para liberar o cashback.`,
            );
            refreshVitrine();
          }}
        />
      )}
    </>
  );
}

/** Sem saída marcada, a estimativa usa hoje como referência de idade. */
function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Ícone inline (currentColor, sem asset), como o resto do sistema. */
function PlusIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

/** Dificuldade: só "fácil" ganha verde; as demais ficam neutras (cinza é o padrão). */
function difficultyPill(difficulty: string): string {
  return difficulty.toLowerCase() === 'fácil' ? 'pill-go' : 'pill-neutral';
}

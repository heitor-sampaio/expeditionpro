import { useState } from 'react';
import { usePortalExpeditions, usePortalFamily, type Expedition } from './usePortalBrowse.js';
import { formatDateRange } from './format.js';
import { EnrollModal } from './EnrollModal.js';
import { ItineraryCover } from '../itineraries/ItineraryCover.js';
import { useItineraryCovers } from '../itineraries/useItineraryCovers.js';

/**
 * Expedições abertas no portal (§5.8): o cliente vê as saídas da vitrine e se inscreve —
 * o único caminho que gera cashback. Escolhe quem da família vai; a inscrição nasce
 * `pending` e o cashback é liberado quando ela é confirmada. Sem lógica de negócio aqui.
 */

export function PortalExpeditionsScreen({
  onOpenItinerary,
}: {
  readonly onOpenItinerary: (itineraryId: string) => void;
}): React.JSX.Element {
  const { state, refresh } = usePortalExpeditions();
  const family = usePortalFamily();
  const coverOf = useItineraryCovers();
  const [enrollFor, setEnrollFor] = useState<Expedition | null>(null);
  const [done, setDone] = useState<string | null>(null);

  return (
    <div className="page page-wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Expedições</h1>
          <p className="page-meta">
            Inscreva-se pelo app e ganhe cashback — só a inscrição feita aqui gera crédito.
          </p>
        </div>
      </div>

      {done && (
        <div className="feedback feedback-go">
          <span className="feedback-dot" />
          <span>{done}</span>
        </div>
      )}

      {state.status === 'loading' && <ExpeditionsSkeleton />}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar as saídas</span>
            <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' && state.expeditions.length === 0 && (
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">Nenhuma saída aberta agora</span>
            <span className="state-line">Volte em breve — novas expedições aparecem aqui.</span>
          </div>
        </div>
      )}

      {state.status === 'ready' && state.expeditions.length > 0 && (
        <div className="rot-card-grid">
          {state.expeditions.map((exp) => (
            <article key={exp.groupId} className="rot-card">
              <button
                type="button"
                className="rot-card-open"
                onClick={() => onOpenItinerary(exp.itineraryId)}
                aria-label={`Ver o roteiro ${exp.itineraryName}`}
              >
                <ItineraryCover coverPath={coverOf(exp.itineraryId)} />
                <div className="rot-card-body">
                  <span className="rot-card-name">{exp.itineraryName}</span>
                  <span className="exp-dates">{formatDateRange(exp.startDate, exp.endDate)}</span>
                </div>
              </button>
              <div className="rot-card-foot">
                {exp.vacancies === 0 && <span className="occ-pill is-full">lotada</span>}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={exp.vacancies === 0}
                  onClick={() => setEnrollFor(exp)}
                >
                  Inscrever-se
                </button>
              </div>
            </article>
          ))}
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
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ExpeditionsSkeleton(): React.JSX.Element {
  return (
    <div className="rot-card-grid" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="rot-card">
          <div className="rot-card-cover rot-card-cover-empty" />
          <div className="rot-card-body">
            <span className="skel-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

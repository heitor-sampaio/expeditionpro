import { PortalItineraryDetail } from './PortalItineraryDetail.js';

/**
 * Página do roteiro no portal: a casca (voltar + página) em torno do conteúdo.
 */
export function PortalItineraryScreen({
  itineraryId,
  onBack,
}: {
  readonly itineraryId: string;
  readonly onBack: () => void;
}): React.JSX.Element {
  return (
    <div className="page page-wide">
      <button type="button" className="btn btn-secondary btn-sm back-btn" onClick={onBack}>
        ‹ Voltar
      </button>
      <PortalItineraryDetail itineraryId={itineraryId} />
    </div>
  );
}

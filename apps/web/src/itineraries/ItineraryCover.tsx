import { useEffect, useState } from 'react';
import { signedUrlFor, thumbPathOf } from '../ui/uploadImages.js';

/**
 * Capa do roteiro (RO-04). O bucket é privado, então a imagem só aparece por URL
 * assinada de validade curta — buscada aqui, na borda, sob demanda. Sem capa, um
 * marcador neutro no lugar (nunca um card quebrado).
 */

const BUCKET = 'itineraries';

export function ItineraryCover({
  coverPath,
  className = 'rot-card-cover',
}: {
  readonly coverPath: string | null;
  readonly className?: string;
}): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!coverPath) {
      setUrl(null);
      return;
    }
    let alive = true;
    void signedUrlFor(thumbPathOf(coverPath), BUCKET).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [coverPath]);

  if (url) return <img className={className} src={url} alt="" />;
  return (
    <div className={`${className} rot-card-cover-empty`} aria-hidden>
      <span className="rot-card-cover-mark">sem foto</span>
    </div>
  );
}

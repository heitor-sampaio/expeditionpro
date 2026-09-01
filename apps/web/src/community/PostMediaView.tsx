import { useState } from 'react';
import { MediaThumb } from './MediaThumb.js';
import type { FeedMedia, PostLayout } from './useCommunity.js';

/**
 * Mídia de um post (§5.12): uma foto ocupa a largura; com mais de uma, o autor escolhe
 * **mosaico** (grade) ou **carrossel** (uma por vez, com setas). Só apresentação; as fotos
 * vêm do bucket privado por URL assinada (MediaThumb). Usado no feed e na moderação.
 */
export function PostMediaView({
  media,
  layout,
}: {
  media: FeedMedia[];
  layout: PostLayout;
}): React.JSX.Element | null {
  const [index, setIndex] = useState(0);

  if (media.length === 0) return null;

  if (media.length === 1) {
    const only = media[0]!;
    return (
      <div className="post-media">
        <MediaThumb storagePath={only.storagePath} alt={only.alt} />
      </div>
    );
  }

  if (layout === 'carousel') {
    const at = Math.min(index, media.length - 1);
    const current = media[at]!;
    return (
      <div className="post-carousel">
        <MediaThumb storagePath={current.storagePath} alt={current.alt} />
        <button
          type="button"
          className="carousel-nav carousel-prev"
          aria-label="Foto anterior"
          onClick={() => setIndex((i) => (i - 1 + media.length) % media.length)}
        >
          ‹
        </button>
        <button
          type="button"
          className="carousel-nav carousel-next"
          aria-label="Próxima foto"
          onClick={() => setIndex((i) => (i + 1) % media.length)}
        >
          ›
        </button>
        <div className="carousel-dots" aria-hidden="true">
          {media.map((m, i) => (
            <span key={m.storagePath} className={`carousel-dot${i === at ? ' is-active' : ''}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`post-mosaic post-mosaic-${Math.min(media.length, 3)}`}>
      {media.map((m) => (
        <MediaThumb key={m.storagePath} storagePath={m.storagePath} alt={m.alt} />
      ))}
    </div>
  );
}

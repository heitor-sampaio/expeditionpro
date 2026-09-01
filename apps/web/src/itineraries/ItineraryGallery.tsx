import { useEffect, useMemo, useState } from 'react';
import { signedUrlsFor, thumbPathOf } from '../ui/uploadImages.js';
import { useItineraryPhotos } from './useItineraryPhotos.js';

/**
 * Galeria de leitura do roteiro (RO-01/RO-04): a foto em destaque em 4:5 e as demais em
 * miniatura ao lado — clicar troca o destaque.
 *
 * Trocar precisa ser instantâneo, então nada de assinar URL no clique: o bucket é privado,
 * mas **todas** as URLs (cheias e miniaturas) são assinadas de uma vez, numa ida à rede, e
 * as imagens cheias entram no cache do navegador por pré-carga. O clique só troca o `src`.
 */

const BUCKET = 'itineraries';

/** Quantas fotos cheias entram em pré-carga. A galeria aceita 20; baixar todas de saída
 *  seriam ~8 MB para quem talvez veja três. O resto carrega ao apontar ou clicar. */
const PRELOAD = 6;

export function ItineraryGallery({
  itineraryId,
  coverPath,
}: {
  readonly itineraryId: string;
  readonly coverPath: string | null;
}): React.JSX.Element {
  const photos = useItineraryPhotos(itineraryId);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);

  const paths = useMemo(() => photos?.map((p) => p.storagePath) ?? [], [photos]);

  // Cada roteiro reabre no seu destaque: a capa (ou a primeira foto).
  useEffect(() => setSelected(null), [itineraryId]);

  useEffect(() => {
    if (paths.length === 0) return;
    let alive = true;
    const wanted = [...paths, ...paths.map(thumbPathOf)];
    void signedUrlsFor(wanted, BUCKET).then((map) => {
      if (!alive) return;
      setUrls(map);
      // Pré-carga das primeiras: quando o clique vier, já estão no cache do navegador.
      for (const path of paths.slice(0, PRELOAD)) {
        const url = map.get(path);
        if (!url) continue;
        const img = new Image();
        img.onload = () => {
          if (alive) setLoaded((prev) => new Set(prev).add(path));
        };
        img.src = url;
      }
    });
    return () => {
      alive = false;
    };
  }, [paths]);

  /** Traz a foto cheia para o cache (ao apontar ou clicar numa que ficou fora da pré-carga). */
  const load = (path: string): void => {
    if (loaded.has(path)) return;
    const url = urls.get(path);
    if (!url) return;
    const img = new Image();
    img.onload = () => setLoaded((prev) => new Set(prev).add(path));
    img.src = url;
  };

  const featured = selected ?? coverPath ?? paths[0] ?? null;
  // Enquanto a imagem cheia não terminou de baixar, mostra a miniatura (que já está em
  // cache, porque aparece ao lado): o clique responde na hora e ganha nitidez em seguida.
  const featuredUrl = featured
    ? ((loaded.has(featured) ? urls.get(featured) : urls.get(thumbPathOf(featured))) ??
      urls.get(featured) ??
      null)
    : null;

  return (
    <div className="rot-gallery">
      {featuredUrl ? (
        <img className="rot-gallery-main" src={featuredUrl} alt="" />
      ) : (
        <div className="rot-gallery-main rot-card-cover-empty" aria-hidden>
          <span className="rot-card-cover-mark">sem foto</span>
        </div>
      )}

      {paths.length > 1 && (
        <div className="rot-gallery-thumbs">
          {paths.map((path) => {
            const thumbUrl = urls.get(thumbPathOf(path));
            return (
              <button
                key={path}
                type="button"
                className={`rot-thumb${path === featured ? ' is-active' : ''}`}
                onClick={() => {
                  setSelected(path);
                  load(path);
                }}
                onMouseEnter={() => load(path)}
                aria-label="Ver esta foto"
              >
                {thumbUrl ? <img src={thumbUrl} alt="" /> : <span className="rot-thumb-empty" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

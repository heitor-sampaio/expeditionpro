import { useEffect, useState } from 'react';
import { signedUrl, thumbPathOf } from './uploadMedia.js';

/**
 * Miniatura de uma mídia do bucket privado, resolvida por URL assinada de validade curta.
 * Compartilhada entre o feed do portal e a moderação no back-office.
 */
export function MediaThumb({
  storagePath,
  alt,
}: {
  storagePath: string;
  alt: string | null;
}): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void signedUrl(thumbPathOf(storagePath)).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [storagePath]);
  return (
    <div className="post-thumb">
      {url ? <img src={url} alt={alt ?? ''} loading="lazy" /> : <div className="post-thumb-skel" />}
    </div>
  );
}

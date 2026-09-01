import { useEffect, useRef, useState } from 'react';
import { uploadImages, signedUrlFor, thumbPathOf, MediaError } from '../ui/uploadImages.js';

/**
 * Galeria de fotos do roteiro (RO-01): sobe até 20 imagens (comprimidas no cliente, bucket
 * privado `itineraries`), escolhe uma como capa e remove. Sem lógica de negócio — o limite e
 * a regra de capa única são reforçados no servidor; aqui só a montagem do conjunto e o upload.
 */

const BUCKET = 'itineraries';
const MAX_PHOTOS = 20;

export interface PhotoItem {
  storagePath: string;
  isCover: boolean;
}

export function PhotoGallery({
  photos,
  onChange,
}: {
  photos: PhotoItem[];
  onChange: (next: PhotoItem[]) => void;
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return;
    const chosen = Array.from(files).slice(0, room);
    setUploading(true);
    try {
      const uploaded = await uploadImages(chosen, BUCKET);
      const added: PhotoItem[] = uploaded.map((u) => ({
        storagePath: u.storagePath,
        isCover: false,
      }));
      const next = [...photos, ...added];
      // Primeira foto da galeria vira capa por padrão.
      if (!next.some((p) => p.isCover) && next[0]) next[0].isCover = true;
      onChange(next);
    } catch (e) {
      setError(e instanceof MediaError ? e.message : 'Não foi possível enviar a foto.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const setCover = (path: string) =>
    onChange(photos.map((p) => ({ ...p, isCover: p.storagePath === path })));

  const remove = (path: string) => {
    const next = photos.filter((p) => p.storagePath !== path);
    // Se a capa saiu, promove a primeira restante.
    if (!next.some((p) => p.isCover) && next[0]) next[0].isCover = true;
    onChange(next);
  };

  return (
    <div className="photo-gallery">
      {error && (
        <div className="feedback feedback-error form-alert">
          <span className="feedback-dot" />
          <span>{error}</span>
        </div>
      )}
      <div className="photo-grid">
        {photos.map((p) => (
          <PhotoCell
            key={p.storagePath}
            photo={p}
            onSetCover={() => setCover(p.storagePath)}
            onRemove={() => remove(p.storagePath)}
          />
        ))}
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            className="photo-add"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Enviando…' : '+ Adicionar'}
          </button>
        )}
      </div>
      <span className="photo-hint">
        {photos.length}/{MAX_PHOTOS} fotos · a capa aparece na vitrine do roteiro
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void pick(e.target.files)}
      />
    </div>
  );
}

function PhotoCell({
  photo,
  onSetCover,
  onRemove,
}: {
  photo: PhotoItem;
  onSetCover: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void signedUrlFor(thumbPathOf(photo.storagePath), BUCKET).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [photo.storagePath]);

  return (
    <div className={`photo-cell${photo.isCover ? ' is-cover' : ''}`}>
      {url ? (
        <img className="photo-img" src={url} alt="" />
      ) : (
        <span className="photo-img photo-img-loading" aria-hidden />
      )}
      {photo.isCover && <span className="photo-cover-badge">Capa</span>}
      <div className="photo-cell-actions">
        {!photo.isCover && (
          <button type="button" className="photo-chip" onClick={onSetCover}>
            Definir capa
          </button>
        )}
        <button
          type="button"
          className="photo-chip photo-chip-remove"
          onClick={onRemove}
          aria-label="Remover foto"
        >
          Remover
        </button>
      </div>
    </div>
  );
}

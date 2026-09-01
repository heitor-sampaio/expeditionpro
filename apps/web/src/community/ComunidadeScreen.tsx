import { useEffect, useRef, useState } from 'react';
import { MAX_MEDIA } from '@expedition/domain';
import { useCommunity, type FeedComment, type FeedPost, type PostLayout } from './useCommunity.js';
import { uploadCommunityMedia, MediaError } from './uploadMedia.js';
import { PostMediaView } from './PostMediaView.js';
import { RichText } from './RichText.js';
import { MarkdownEditor } from '../ui/MarkdownEditor.js';
import { useModeration, type ReportItem } from './useModeration.js';

/**
 * Comunidade (§5.12) — a MESMA tela para cliente e equipe. O feed, o composer (num modal),
 * curtir/comentar e o layout são iguais; no modo `admin` a equipe publica **como a marca**,
 * o menu ⋯ vira moderação (destacar/ocultar/remover) e a fila de denúncias aparece no topo.
 * Mídia por URL assinada; o servidor valida e a RLS isola por tenant e audiência.
 */
export function ComunidadeScreen({ admin = false }: { admin?: boolean }): React.JSX.Element {
  const community = useCommunity();
  const moderation = useModeration(admin, community.refresh);
  const [composing, setComposing] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { loadMore } = community;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="page page-wide community-page">
      <div className="page-header page-header-row">
        <div>
          <h1 className="page-title">Comunidade</h1>
          <p className="page-meta">
            {admin
              ? 'Poste como a marca e modere o feed do tenant.'
              : 'Compartilhe suas aventuras com quem viaja com a gente.'}
          </p>
        </div>
        <div className="state-grow" />
        <button type="button" className="btn btn-primary" onClick={() => setComposing(true)}>
          Nova publicação
        </button>
      </div>

      {admin && moderation.reports.length > 0 && (
        <ReportsQueue reports={moderation.reports} moderation={moderation} />
      )}

      {composing && (
        <ComposerModal
          busy={community.busy}
          onClose={() => setComposing(false)}
          onPublish={(body, media, layout) =>
            community.createPost({ body, itineraryId: null, layout, media })
          }
        />
      )}

      <div className="feed">
        {community.state.status === 'loading' && <p className="members-empty">Carregando feed…</p>}

        {community.state.status === 'error' && (
          <section className="card">
            <div className="state" role="alert">
              <div className="state-text">
                <span className="state-title">Não deu para carregar o feed</span>
                <span className="state-line is-error">Tente de novo.</span>
              </div>
              <div className="state-grow" />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={community.refresh}
              >
                Tentar de novo
              </button>
            </div>
          </section>
        )}

        {community.state.status === 'ready' && community.state.posts.length === 0 && (
          <section className="card">
            <div className="state" role="status">
              <div className="state-text">
                <span className="state-title">Nenhuma aventura ainda</span>
                <span className="state-line">Seja o primeiro a publicar uma foto da estrada.</span>
              </div>
            </div>
          </section>
        )}

        {community.state.status === 'ready' &&
          community.state.posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              community={community}
              admin={admin}
              moderation={moderation}
            />
          ))}

        {community.state.status === 'ready' && community.hasMore && (
          <div ref={sentinelRef} className="feed-sentinel">
            {community.loadingMore && <span className="members-empty">Carregando mais…</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function ComposerModal({
  busy,
  onClose,
  onPublish,
}: {
  busy: boolean;
  onClose: () => void;
  onPublish: (
    body: string,
    media: { storagePath: string; alt: string | null }[],
    layout: PostLayout,
  ) => Promise<{ ok: boolean; message?: string }>;
}): React.JSX.Element {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [layout, setLayout] = useState<PostLayout>('mosaic');
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const pick = (list: FileList | null) => {
    setFeedback(null);
    setFiles(list ? Array.from(list).slice(0, MAX_MEDIA) : []);
  };
  const removeAt = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const publish = async () => {
    setFeedback(null);
    if (files.length === 0) {
      setFeedback({ ok: false, text: 'Escolha ao menos uma foto.' });
      return;
    }
    setUploading(true);
    try {
      const media = (await uploadCommunityMedia(files)).map((m) => ({
        storagePath: m.storagePath,
        alt: null,
      }));
      const result = await onPublish(body, media, layout);
      if (result.ok) onClose();
      else setFeedback({ ok: false, text: result.message ?? 'Falhou.' });
    } catch (error) {
      setFeedback({
        ok: false,
        text: error instanceof MediaError ? error.message : 'Falha ao enviar as fotos.',
      });
    } finally {
      setUploading(false);
    }
  };

  const working = busy || uploading;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Nova publicação">
      <div className="modal modal-lg composer">
        <h2 className="modal-title">Nova publicação</h2>
        {feedback && (
          <div className={`feedback ${feedback.ok ? 'feedback-go' : 'feedback-error'}`}>
            <span className="feedback-dot" />
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="field field-full">
          <span className="field-label">Fotos (1 a {MAX_MEDIA})</span>
          <div className="file-pick">
            <label className="btn btn-secondary file-pick-btn">
              Escolher fotos
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => pick(e.target.files)}
              />
            </label>
            <span className="field-help">
              {files.length > 0
                ? `${files.length} de ${MAX_MEDIA} selecionada(s)`
                : 'nenhuma ainda'}
            </span>
          </div>
          {previews.length > 0 && (
            <div className="composer-previews">
              {previews.map((url, i) => (
                <div key={url} className="composer-preview">
                  <img src={url} alt={`Foto ${i + 1}`} />
                  <button
                    type="button"
                    className="composer-preview-remove"
                    aria-label="Remover foto"
                    onClick={() => removeAt(i)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {files.length > 1 && (
          <div className="field field-full">
            <span className="field-label">Como mostrar as fotos</span>
            <div className="seg" role="radiogroup" aria-label="Layout das fotos">
              <button
                type="button"
                role="radio"
                aria-checked={layout === 'mosaic'}
                className={`seg-btn${layout === 'mosaic' ? ' is-active' : ''}`}
                onClick={() => setLayout('mosaic')}
              >
                Mosaico
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={layout === 'carousel'}
                className={`seg-btn${layout === 'carousel' ? ' is-active' : ''}`}
                onClick={() => setLayout('carousel')}
              >
                Carrossel
              </button>
            </div>
          </div>
        )}

        <label className="field field-full">
          <span className="field-label">Legenda</span>
          <MarkdownEditor
            value={body}
            onChange={setBody}
            maxLength={2000}
            placeholder="Conte como foi… use **negrito**, *itálico* e #hashtags"
          />
        </label>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={working || files.length === 0}
            onClick={() => void publish()}
          >
            {uploading ? 'Enviando fotos…' : working ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PostCard({
  post,
  community,
  admin,
  moderation,
}: {
  post: FeedPost;
  community: ReturnType<typeof useCommunity>;
  admin: boolean;
  moderation: ReturnType<typeof useModeration>;
}): React.JSX.Element {
  // Já mostra os comentários quando o post tem algum — sem precisar clicar no botão.
  const [showComments, setShowComments] = useState(post.commentCount > 0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <section className="card post-card">
      <div className="post-head">
        <span className="avatar">{initials(post.authorName)}</span>
        <div className="post-id">
          <span className="post-author">
            {post.authorName}
            {post.official && <span className="pill pill-go post-badge">oficial</span>}
            {post.featured && <span className="pill pill-neutral post-badge">destaque</span>}
          </span>
          <span className="post-date mono">{formatDate(post.createdAt)}</span>
        </div>
        <div className="topbar-spacer" />
        <PostMenu
          admin={admin}
          mine={post.mine}
          featured={post.featured}
          onDelete={() => setConfirmDelete(true)}
          onReport={() => void community.report(post.id, 'denúncia do feed')}
          onHide={() => void moderation.moderate(post.id, 'hide', 'Ocultado pela equipe')}
          onRemove={() => void moderation.moderate(post.id, 'remove', 'Removido pela equipe')}
          onToggleFeature={() => void moderation.highlight(post.id, !post.featured)}
        />
      </div>

      {confirmDelete && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Apagar publicação">
          <div className="modal">
            <h2 className="modal-title">Apagar publicação?</h2>
            <p className="modal-sub">Ela sai do feed e não dá para desfazer.</p>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setConfirmDelete(false);
                  void community.deletePost(post.id);
                }}
              >
                Apagar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="post-media-col">
        <PostMediaView media={post.media} layout={post.layout} />
      </div>

      {post.body && (
        <div className="post-body">
          <RichText text={post.body} />
        </div>
      )}

      <div className="post-actions">
        <button
          type="button"
          className={`btn btn-secondary btn-sm post-action${post.likedByViewer ? ' is-active' : ''}`}
          aria-pressed={post.likedByViewer}
          onClick={() => void community.toggleLike(post.id)}
        >
          <HeartIcon filled={post.likedByViewer} />
          <span>{post.likeCount}</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm post-action"
          onClick={() => setShowComments((v) => !v)}
        >
          <CommentIcon />
          <span>{post.commentCount}</span>
        </button>
      </div>

      {showComments && <Comments postId={post.id} community={community} />}
    </section>
  );
}

function Comments({
  postId,
  community,
}: {
  postId: string;
  community: ReturnType<typeof useCommunity>;
}): React.JSX.Element {
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    let alive = true;
    void community.loadComments(postId).then((rows) => {
      if (alive) setComments(rows);
    });
    return () => {
      alive = false;
    };
  }, [postId, community]);

  const send = async () => {
    const body = text.trim();
    if (body === '') return;
    const ok = await community.comment(postId, body);
    if (ok) {
      setText('');
      const rows = await community.loadComments(postId);
      setComments(rows);
    }
  };

  return (
    <div className="post-comments">
      {comments?.length === 0 && <span className="members-empty">Sem comentários ainda.</span>}
      {comments?.map((c) => (
        <div key={c.id} className="post-comment">
          <span className="post-comment-author">{c.authorName}</span>
          <span className="post-comment-body">{c.body}</span>
        </div>
      ))}
      <div className="inline-form">
        <input
          className="field-input"
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          placeholder="Escreva um comentário"
        />
        <button
          type="button"
          className="inline-send"
          aria-label="Enviar comentário"
          disabled={text.trim() === ''}
          onClick={() => void send()}
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}

/** Fila de denúncias abertas (CO-08), no topo do feed do admin. */
function ReportsQueue({
  reports,
  moderation,
}: {
  reports: ReportItem[];
  moderation: ReturnType<typeof useModeration>;
}): React.JSX.Element {
  return (
    <section className="card">
      <div className="panel-head">
        <h2 className="card-title">Denúncias abertas</h2>
        <span className="pill pill-neutral">{reports.length}</span>
      </div>
      {reports.map((r) => (
        <div key={r.id} className="rowpanel-block report-row">
          <div className="report-info">
            <span className="rowpanel-title">
              {r.reporterName} denunciou · {r.reason}
            </span>
            {r.postBody !== null ? (
              <span className="field-help">
                Post de {r.postAuthorName}: “{r.postBody.slice(0, 120)}”
                {r.postStatus !== 'published' ? ` · ${r.postStatus}` : ''}
              </span>
            ) : (
              <span className="field-help">Conteúdo já indisponível.</span>
            )}
          </div>
          <div className="post-actions">
            {r.postId && (
              <button
                type="button"
                className="btn btn-secondary btn-sm btn-danger"
                disabled={moderation.busy}
                onClick={async () => {
                  const ok = await moderation.moderate(
                    r.postId!,
                    'remove',
                    `Denúncia: ${r.reason}`,
                  );
                  if (ok) await moderation.resolve(r.id, 'resolved');
                }}
              >
                Remover post
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={moderation.busy}
              onClick={() => void moderation.resolve(r.id, 'dismissed')}
            >
              Descartar
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * Menu "⋯" do post. Cliente: **Apagar** (se é seu) ou **Denunciar**. Admin: as ações de
 * **moderação** — destacar, ocultar, remover. Fecha ao clicar fora.
 */
function PostMenu({
  admin,
  mine,
  featured,
  onDelete,
  onReport,
  onHide,
  onRemove,
  onToggleFeature,
}: {
  admin: boolean;
  mine: boolean;
  featured: boolean;
  onDelete: () => void;
  onReport: () => void;
  onHide: () => void;
  onRemove: () => void;
  onToggleFeature: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="post-menu" ref={ref}>
      <button
        type="button"
        className="post-menu-btn"
        aria-label="Mais opções"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div className="menu" role="menu">
          {admin ? (
            <>
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={() => pick(onToggleFeature)}
              >
                {featured ? 'Remover destaque' : 'Destacar'}
              </button>
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={() => pick(onHide)}
              >
                Ocultar
              </button>
              <button
                type="button"
                className="menu-item menu-item-danger"
                role="menuitem"
                onClick={() => pick(onRemove)}
              >
                Remover
              </button>
            </>
          ) : (
            <button
              type="button"
              className="menu-item menu-item-danger"
              role="menuitem"
              onClick={() => pick(mine ? onDelete : onReport)}
            >
              {mine ? 'Apagar' : 'Denunciar'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function HeartIcon({ filled }: { filled: boolean }): React.JSX.Element {
  return (
    <svg
      className="post-ic"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20.3 4.6 13a4.5 4.5 0 0 1 6.4-6.3l1 1 1-1a4.5 4.5 0 0 1 6.4 6.3z" />
    </svg>
  );
}

function SendIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </svg>
  );
}

function CommentIcon(): React.JSX.Element {
  return (
    <svg
      className="post-ic"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 5.5h16v10H9l-4 3.5V15.5H4z" />
    </svg>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

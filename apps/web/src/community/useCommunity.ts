import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../auth/api.js';
import { useLiveRefresh } from '../live/useLiveRefresh.js';

/**
 * Comunidade no portal (§5.12). Lê o feed e faz as ações do cliente (curtir, comentar,
 * postar, denunciar). Nenhuma regra aqui — validação e audiência vivem nos casos de uso.
 */

export interface FeedMedia {
  storagePath: string;
  alt: string | null;
}
export type PostLayout = 'carousel' | 'mosaic';
export interface FeedPost {
  id: string;
  authorName: string;
  body: string;
  itineraryId: string | null;
  layout: PostLayout;
  createdAt: string;
  media: FeedMedia[];
  likeCount: number;
  commentCount: number;
  likedByViewer: boolean;
  featured: boolean;
  official: boolean;
  mine: boolean;
}
export interface FeedComment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  /** CO-10: o servidor decide; a tela só oferece "Apagar" quando é verdade. */
  mine: boolean;
}

export type FeedState =
  { status: 'loading' } | { status: 'ready'; posts: FeedPost[] } | { status: 'error' };

export interface NewPostInput {
  body: string;
  itineraryId: string | null;
  layout: PostLayout;
  media: { storagePath: string; alt: string | null }[];
}

const PAGE = 8;

export function useCommunity() {
  const [state, setState] = useState<FeedState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const postsRef = useRef<FeedPost[]>([]);

  useEffect(() => {
    if (state.status === 'ready') postsRef.current = state.posts;
  }, [state]);

  useEffect(() => {
    setState({ status: 'loading' });
    setHasMore(true);
    const controller = new AbortController();
    api(`/v1/community/feed?limit=${PAGE}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<FeedPost[]>;
      })
      .then((posts) => {
        setState({ status: 'ready', posts });
        setHasMore(posts.length === PAGE);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // Scroll infinito: busca a próxima página a partir do último post (cursor beforeId).
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const last = postsRef.current[postsRef.current.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const res = await api(`/v1/community/feed?limit=${PAGE}&beforeId=${last.id}`);
      if (res.ok) {
        const more = (await res.json()) as FeedPost[];
        setState((s) =>
          s.status === 'ready' ? { status: 'ready', posts: [...s.posts, ...more] } : s,
        );
        setHasMore(more.length === PAGE);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore]);

  // CO-04: curtidas e comentários ao vivo.
  useLiveRefresh('community-live', [{ table: 'post_likes' }, { table: 'post_comments' }], () =>
    setReloadKey((k) => k + 1),
  );

  const toggleLike = useCallback(async (postId: string) => {
    const res = await api(`/v1/community/posts/${postId}/like`, { method: 'POST' });
    if (res.ok) {
      const result = (await res.json()) as { liked: boolean; likeCount: number };
      setState((s) =>
        s.status === 'ready'
          ? {
              status: 'ready',
              posts: s.posts.map((p) =>
                p.id === postId
                  ? { ...p, likedByViewer: result.liked, likeCount: result.likeCount }
                  : p,
              ),
            }
          : s,
      );
    }
  }, []);

  const comment = useCallback(async (postId: string, body: string): Promise<boolean> => {
    const res = await api(`/v1/community/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (res.ok) {
      setState((s) =>
        s.status === 'ready'
          ? {
              status: 'ready',
              posts: s.posts.map((p) =>
                p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p,
              ),
            }
          : s,
      );
    }
    return res.ok;
  }, []);

  const loadComments = useCallback(async (postId: string): Promise<FeedComment[]> => {
    const res = await api(`/v1/community/posts/${postId}/comments`);
    return res.ok ? ((await res.json()) as FeedComment[]) : [];
  }, []);

  const createPost = useCallback(
    async (input: NewPostInput): Promise<{ ok: boolean; message?: string }> => {
      setBusy(true);
      try {
        const res = await api('/v1/community/posts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!res.ok) return { ok: false, message: `Não deu para publicar (${res.status}).` };
        setReloadKey((k) => k + 1);
        return { ok: true };
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const report = useCallback(async (postId: string, reason: string): Promise<boolean> => {
    const res = await api('/v1/community/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ postId, reason }),
    });
    return res.ok;
  }, []);

  const deleteComment = useCallback(async (postId: string, commentId: string): Promise<boolean> => {
    const res = await api(`/v1/community/comments/${commentId}`, { method: 'DELETE' });
    if (res.ok) {
      setState((st) =>
        st.status === 'ready'
          ? {
              status: 'ready',
              posts: st.posts.map((p) =>
                p.id === postId ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p,
              ),
            }
          : st,
      );
    }
    return res.ok;
  }, []);

  const deletePost = useCallback(async (postId: string): Promise<boolean> => {
    const res = await api(`/v1/community/posts/${postId}`, { method: 'DELETE' });
    if (res.ok) {
      setState((s) =>
        s.status === 'ready'
          ? { status: 'ready', posts: s.posts.filter((p) => p.id !== postId) }
          : s,
      );
    }
    return res.ok;
  }, []);

  return {
    state,
    refresh,
    busy,
    hasMore,
    loadingMore,
    loadMore,
    toggleLike,
    comment,
    deleteComment,
    loadComments,
    createPost,
    report,
    deletePost,
  };
}

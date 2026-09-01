import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Moderação da comunidade (§5.12 · CO-08), sobreposta ao feed comum: a fila de denúncias e
 * as ações da equipe (ocultar/remover/restaurar/destacar). `onChange` recarrega o feed do
 * `useCommunity` quando uma ação muda o que aparece. Só ativa no modo admin (`enabled`).
 */

export type ModerationAction = 'hide' | 'remove' | 'restore';

export interface ReportItem {
  id: string;
  reason: string;
  reporterName: string;
  createdAt: string;
  postId: string | null;
  commentId: string | null;
  postAuthorName: string | null;
  postBody: string | null;
  postStatus: string | null;
}

export function useModeration(enabled: boolean, onChange: () => void) {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    api('/v1/community/reports', { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<ReportItem[]>) : []))
      .then(setReports)
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled, reloadKey]);

  const bump = () => {
    setReloadKey((k) => k + 1);
    onChange();
  };

  const moderate = useCallback(
    async (postId: string, action: ModerationAction, reason: string): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await api(`/v1/community/posts/${postId}/moderate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, reason }),
        });
        if (res.ok) bump();
        return res.ok;
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  const highlight = useCallback(
    async (postId: string, featured: boolean): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await api(`/v1/community/posts/${postId}/highlight`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ featured }),
        });
        if (res.ok) bump();
        return res.ok;
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  const resolve = useCallback(
    async (reportId: string, decision: 'resolved' | 'dismissed'): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await api(`/v1/community/reports/${reportId}/resolve`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decision }),
        });
        if (res.ok) bump();
        return res.ok;
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  return { reports, busy, moderate, highlight, resolve };
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Termo de adesão (§5.13 · DOC-01..03). Carrega o estado do editor (rascunho + versão
 * vigente), salva rascunho (fonte Markdown) e publica. Nenhuma regra aqui: a renderização
 * segura (DOC-09) e o versionamento vivem no servidor. `403` vira estado "sem permissão".
 */

export interface TermVersion {
  id: string;
  versionNumber: number;
  contentJson: unknown;
  contentHtml: string;
  changeSummary: string | null;
  requiresReacceptance: boolean;
  publishedAt: string | null;
  isDraft: boolean;
}

export interface TermEditor {
  documentId: string;
  draft: TermVersion | null;
  current: TermVersion | null;
}

export type TermState =
  | { status: 'loading' }
  | { status: 'ready'; editor: TermEditor }
  | { status: 'forbidden' }
  | { status: 'error' };

export type TermActionResult = { ok: true } | { ok: false; message: string };

export function markdownOf(version: TermVersion | null): string {
  const json = version?.contentJson as { markdown?: string } | undefined;
  return json?.markdown ?? '';
}

export function useTermDocument() {
  const [state, setState] = useState<TermState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api('/v1/documents/term', { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 403) {
          setState({ status: 'forbidden' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const editor = (await res.json()) as TermEditor;
        setState({ status: 'ready', editor });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const saveDraft = useCallback(async (markdown: string): Promise<TermActionResult> => {
    setBusy(true);
    try {
      const res = await api('/v1/documents/term/draft', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ markdown }),
      });
      if (!res.ok) return { ok: false, message: `Não deu para salvar o rascunho (${res.status}).` };
      setReloadKey((k) => k + 1);
      return { ok: true };
    } finally {
      setBusy(false);
    }
  }, []);

  const publish = useCallback(
    async (requiresReacceptance: boolean, changeSummary: string): Promise<TermActionResult> => {
      setBusy(true);
      try {
        const res = await api('/v1/documents/term/publish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            requiresReacceptance,
            changeSummary: changeSummary.trim() === '' ? null : changeSummary.trim(),
          }),
        });
        if (res.status === 400) {
          return { ok: false, message: 'Salve um rascunho antes de publicar.' };
        }
        if (!res.ok) return { ok: false, message: `Não deu para publicar (${res.status}).` };
        setReloadKey((k) => k + 1);
        return { ok: true };
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { state, refresh, saveDraft, publish, busy };
}

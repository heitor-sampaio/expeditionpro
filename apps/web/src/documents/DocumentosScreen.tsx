import { useEffect, useState } from 'react';
import { markdownOf, useTermDocument, type TermEditor } from './useTermDocument.js';

/**
 * Configurações → Documentos (§5.13 · DOC-01/02/03). Editor Markdown do Termo de adesão:
 * salva rascunho, pré-visualiza o HTML já sanitizado no servidor (DOC-09) e publica
 * congelando a versão, marcando se exige novo aceite. Só owner/admin — viewer cai no
 * estado "sem permissão". Nenhuma lógica de negócio aqui; o hook fala com a API.
 */
export function DocumentosScreen(): React.JSX.Element {
  const { state, refresh, saveDraft, publish, busy } = useTermDocument();

  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1 className="page-title">Documentos</h1>
        <p className="page-meta">Termo de adesão — texto, versão e histórico de aceite.</p>
      </div>

      {state.status === 'loading' && <TermSkeleton />}

      {state.status === 'forbidden' && (
        <section className="card">
          <div className="state">
            <div className="state-text">
              <span className="state-title">Sem permissão para editar o Termo</span>
              <span className="state-line">Um owner ou admin do tenant libera o acesso.</span>
            </div>
            <div className="state-grow" />
            <button type="button" className="btn btn-primary" disabled>
              Publicar versão
            </button>
          </div>
        </section>
      )}

      {state.status === 'error' && (
        <section className="card">
          <div className="state" role="alert">
            <div className="state-text">
              <span className="state-title">Não deu para carregar o Termo</span>
              <span className="state-line is-error">Tente de novo.</span>
            </div>
            <div className="state-grow" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
              Tentar de novo
            </button>
          </div>
        </section>
      )}

      {state.status === 'ready' && (
        <TermEditorCard editor={state.editor} busy={busy} saveDraft={saveDraft} publish={publish} />
      )}
    </main>
  );
}

function TermEditorCard({
  editor,
  busy,
  saveDraft,
  publish,
}: {
  editor: TermEditor;
  busy: boolean;
  saveDraft: (markdown: string) => Promise<{ ok: boolean; message?: string }>;
  publish: (
    requiresReacceptance: boolean,
    changeSummary: string,
  ) => Promise<{ ok: boolean; message?: string }>;
}): React.JSX.Element {
  const [markdown, setMarkdown] = useState(() => markdownOf(editor.draft ?? editor.current));
  const [preview, setPreview] = useState(false);
  const [requiresReacceptance, setRequiresReacceptance] = useState(false);
  const [changeSummary, setChangeSummary] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Ao recarregar (rascunho salvo/publicado), reflete a fonte vinda do servidor.
  useEffect(() => {
    setMarkdown(markdownOf(editor.draft ?? editor.current));
  }, [editor]);

  const savedMarkdown = markdownOf(editor.draft ?? editor.current);
  const dirty = markdown !== savedMarkdown;

  const onSave = async () => {
    setFeedback(null);
    const result = await saveDraft(markdown);
    setFeedback(
      result.ok
        ? { ok: true, text: 'Rascunho salvo.' }
        : { ok: false, text: result.message ?? 'Falhou.' },
    );
  };

  const onPublish = async () => {
    setFeedback(null);
    if (dirty) {
      const saved = await saveDraft(markdown);
      if (!saved.ok) {
        setFeedback({ ok: false, text: saved.message ?? 'Falhou ao salvar antes de publicar.' });
        return;
      }
    }
    const result = await publish(requiresReacceptance, changeSummary);
    if (result.ok) {
      setChangeSummary('');
      setRequiresReacceptance(false);
    }
    setFeedback(
      result.ok
        ? { ok: true, text: 'Versão publicada.' }
        : { ok: false, text: result.message ?? 'Falhou.' },
    );
  };

  return (
    <section className="card">
      <div className="panel-head">
        <h2 className="card-title">Termo de adesão</h2>
        {editor.current ? (
          <span className="pill pill-go">versão {editor.current.versionNumber} publicada</span>
        ) : (
          <span className="pill pill-neutral">nenhuma versão publicada</span>
        )}
      </div>
      <p className="field-help">
        Escreva em Markdown: <code>##</code> título, <code>**forte**</code>, <code>*ênfase*</code>,{' '}
        <code>- item</code>, <code>[texto](https://…)</code>. Marcadores como{' '}
        <code>{'{{cliente_nome}}'}</code> são preenchidos no aceite de cada inscrição.
      </p>

      {feedback && (
        <div className={`feedback ${feedback.ok ? 'feedback-go' : 'feedback-error'}`}>
          <span className="feedback-dot" />
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="term-toggle">
        <button
          type="button"
          className={`btn btn-secondary btn-sm${preview ? '' : ' is-active'}`}
          onClick={() => setPreview(false)}
        >
          Editar
        </button>
        <button
          type="button"
          className={`btn btn-secondary btn-sm${preview ? ' is-active' : ''}`}
          onClick={() => setPreview(true)}
        >
          Pré-visualizar
        </button>
        {preview && dirty && (
          <span className="field-help">Salve o rascunho para atualizar a pré-visualização.</span>
        )}
      </div>

      {preview ? (
        <div
          className="term-preview"
          // DOC-09: o HTML vem sanitizado por allowlist do servidor.
          dangerouslySetInnerHTML={{
            __html: (editor.draft ?? editor.current)?.contentHtml ?? '<p>Rascunho vazio.</p>',
          }}
        />
      ) : (
        <label className="field field-full">
          <span className="field-label">Texto do Termo</span>
          <textarea
            className="field-textarea"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder={'## Termo de Adesão\n\nAo se inscrever, o aderente concorda com…'}
          />
        </label>
      )}

      <div className="term-publish">
        <label className="switch-row">
          <span className="switch-label">
            <span className="rowpanel-title">Exige novo aceite</span>
            <span className="field-help">
              Ligado, quem só aceitou uma versão anterior é bloqueado no portal até aceitar esta.
            </span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={requiresReacceptance}
            onChange={(e) => setRequiresReacceptance(e.target.checked)}
          />
        </label>
        <label className="field field-full">
          <span className="field-label">Resumo da mudança</span>
          <input
            className="field-input"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder="O que mudou nesta versão (opcional)"
          />
        </label>
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !dirty}
          onClick={() => void onSave()}
        >
          {busy ? 'Salvando…' : 'Salvar rascunho'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || markdown.trim() === ''}
          onClick={() => void onPublish()}
        >
          {busy ? 'Publicando…' : 'Publicar versão'}
        </button>
      </div>
    </section>
  );
}

function TermSkeleton(): React.JSX.Element {
  return (
    <section className="card" aria-busy>
      <div className="skel-bars">
        <div className="skel-bar" />
        <div className="skel-bar short" />
        <div className="skel-bar" />
      </div>
    </section>
  );
}

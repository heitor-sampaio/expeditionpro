import { useState } from 'react';
import { useSupplierCategories, type SupplierCategory } from './useSupplierCategories.js';

/**
 * FO-05 — o catálogo de categorias, na tela onde ele é usado.
 *
 * Fica em Fornecedores e não em Configurações porque é aqui que a necessidade aparece:
 * quem está cadastrando um fornecedor é quem percebe que falta uma categoria, ou que uma
 * está com o nome errado. Criar continua possível pelo seletor do formulário; esta seção
 * é para ver o conjunto, consertar um nome e tirar o que não se usa.
 *
 * Renomear alcança o histórico inteiro do relatório — a categoria é do fornecedor, e o
 * gasto a herda na leitura. Excluir, por isso mesmo, o servidor recusa enquanto houver
 * fornecedor na categoria.
 */
export function CategoriasSection(): React.JSX.Element {
  const { state, busy, refresh, createCategory, rename, remove } = useSupplierCategories();
  const [creating, setCreating] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const criar = async () => {
    const created = await createCategory(novoNome.trim());
    setFeedback(
      created
        ? { ok: true, text: 'Categoria criada.' }
        : { ok: false, text: 'Não foi possível criar a categoria.' },
    );
    if (created) {
      setNovoNome('');
      setCreating(false);
    }
  };

  const salvarNome = async (id: string) => {
    const result = await rename(id, nomeEditado.trim());
    setFeedback(
      result.ok ? { ok: true, text: 'Categoria renomeada.' } : { ok: false, text: result.message },
    );
    if (result.ok) setEditando(null);
  };

  const excluir = async (cat: SupplierCategory) => {
    const result = await remove(cat.id);
    setFeedback(
      result.ok
        ? { ok: true, text: `"${cat.name}" excluída.` }
        : { ok: false, text: result.message },
    );
  };

  return (
    <section className="card">
      <div className="panel-head">
        <h2 className="card-title">Categorias de fornecedor</h2>
        {state.status === 'ready' && !creating && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCreating(true)}
          >
            Criar categoria
          </button>
        )}
      </div>

      <p className="field-help">
        A categoria é do fornecedor, e o gasto herda a dele. É o que o relatório de gastos por
        categoria soma.
      </p>

      {feedback && (
        <div className={`feedback ${feedback.ok ? 'feedback-go' : 'feedback-error'}`}>
          <span className="feedback-dot" />
          <span>{feedback.text}</span>
        </div>
      )}

      {creating && (
        <div className="cat-add">
          <input
            className="field-input"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Hospedagem, alimentação, apoio…"
            aria-label="Nome da nova categoria"
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || novoNome.trim() === ''}
            onClick={() => void criar()}
          >
            Criar
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setCreating(false);
              setNovoNome('');
            }}
          >
            Cancelar
          </button>
        </div>
      )}

      {state.status === 'loading' && (
        <div className="skel-bars" aria-busy="true">
          <span className="skel-bar" />
          <span className="skel-bar" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar as categorias</span>
            <span className="state-line is-error">Tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'forbidden' && (
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">Sem acesso às categorias</span>
            <span className="state-line">Peça a um owner ou admin do tenant.</span>
          </div>
        </div>
      )}

      {state.status === 'ready' && state.rows.length === 0 && !creating && (
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">Nenhuma categoria ainda</span>
            <span className="state-line">
              Sem categoria, todo gasto cai numa linha só no relatório.
            </span>
          </div>
        </div>
      )}

      {state.status === 'ready' && state.rows.length > 0 && (
        <div className="tbl-wrap">
          <div className="tbl tbl-cat">
            <div className="tbl-row tbl-head">
              <span>Categoria</span>
              <span />
            </div>
            {state.rows.map((cat) => (
              <div key={cat.id} className="tbl-row">
                {editando === cat.id ? (
                  <div className="cat-add">
                    <input
                      className="field-input"
                      value={nomeEditado}
                      onChange={(e) => setNomeEditado(e.target.value)}
                      aria-label={`Novo nome para ${cat.name}`}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy || nomeEditado.trim() === ''}
                      onClick={() => void salvarNome(cat.id)}
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditando(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <span className="pill pill-neutral">{cat.name}</span>
                )}
                <span className="cat-actions">
                  {editando !== cat.id && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busy}
                        onClick={() => {
                          setEditando(cat.id);
                          setNomeEditado(cat.name);
                          setFeedback(null);
                        }}
                      >
                        Renomear
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm btn-danger"
                        disabled={busy}
                        onClick={() => void excluir(cat)}
                      >
                        Excluir
                      </button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

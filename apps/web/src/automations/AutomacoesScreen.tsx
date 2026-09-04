import { useState } from 'react';
import { useAutomations, type Automation } from './useAutomations.js';
import { AutomationEditor } from './AutomationEditor.js';
import { GATILHOS } from './blocks.js';

/**
 * §5.18 — as automações do tenant.
 *
 * A lista é o painel de controle: o que está ligado agindo sobre clientes agora, e o que é
 * rascunho. Por isso o estado ligado/desligado é a coisa mais visível da linha — mais que o
 * nome —, e desligar é sempre um clique, sem confirmação: parar tem que ser fácil.
 *
 * Abrir uma automação troca a tela pelo editor. Não é rota: é o mesmo desenho de
 * `ClientesScreen` → `CustomerScreen`, decidido por estado.
 */
export function AutomacoesScreen(): React.JSX.Element {
  const { state, busy, refresh, criar, salvarGrafo, ligar, duplicar, apagar } = useAutomations();
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const aberta =
    state.status === 'ready' ? (state.automations.find((a) => a.id === abertaId) ?? null) : null;

  /*
   * AU-14 — criar já abre o quadro, e entre a criação e a lista recarregada há um instante em
   * que o id existe e a automação ainda não chegou. O esqueleto cobre esse instante; mostrar a
   * lista de novo, por um piscar, faria parecer que criar não funcionou.
   */
  if (abertaId !== null && aberta === null && state.status !== 'error') {
    return (
      <main className="page page-wide">
        <div className="skeleton" aria-hidden>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skel-card">
              <span className="skel-bars">
                <span className="skel-bar" />
                <span className="skel-bar short" />
              </span>
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (aberta) {
    return (
      <AutomationEditor
        automation={aberta}
        busy={busy}
        onBack={() => setAbertaId(null)}
        onSave={(graph) => salvarGrafo(aberta.id, graph)}
        onToggle={(enabled, confirmMoneyActions) => ligar(aberta.id, enabled, confirmMoneyActions)}
      />
    );
  }

  return (
    <main className="page page-wide">
      <div className="page-header">
        <div className="toolbar">
          <div>
            <h1 className="page-title">Automações</h1>
            <p className="page-meta">
              O que o sistema faz sozinho. Toda automação nasce desligada — ligar é decisão de quem
              responde por ela.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={state.status !== 'ready' || busy}
            onClick={() => {
              setAviso(null);
              setNova(true);
            }}
          >
            Criar automação
          </button>
        </div>
      </div>

      {aviso && (
        <div className="feedback feedback-info" role="status">
          <span className="feedback-dot" />
          <span>{aviso}</span>
        </div>
      )}

      {state.status === 'loading' && (
        <div className="skeleton" aria-hidden>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skel-card">
              <span className="skel-bars">
                <span className="skel-bar" />
                <span className="skel-bar short" />
              </span>
            </div>
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar as automações</span>
            <span className="state-line is-error">Tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'forbidden' && (
        <div className="state">
          <div className="state-text">
            <span className="state-title">Sem acesso às automações</span>
            <span className="state-line">
              Automação age com o poder de quem a liga. Peça a um owner ou admin.
            </span>
          </div>
          <div className="state-grow" />
        </div>
      )}

      {state.status === 'ready' && state.automations.length === 0 && (
        <div className="state">
          <div className="state-text">
            <span className="state-title">Nenhuma automação ainda</span>
            <span className="state-line">
              Comece por uma pequena: responder quem pergunta o preço fora do horário.
            </span>
          </div>
          <div className="state-grow" />
        </div>
      )}

      {state.status === 'ready' && state.automations.length > 0 && (
        <div className="tbl-wrap">
          <div className="tbl tbl-auto">
            <div className="tbl-row tbl-head">
              <span>Automação</span>
              <span>Gatilho</span>
              <span className="col-num">Blocos</span>
              <span className="col-center">Ligada</span>
              <span />
            </div>
            {state.automations.map((a) => (
              <Linha
                key={a.id}
                automation={a}
                busy={busy}
                onOpen={() => setAbertaId(a.id)}
                onToggle={async () => {
                  setAviso(null);
                  const r = await ligar(a.id, !a.enabled);
                  if (!r.ok) setAviso(r.message);
                }}
                onDuplicate={async () => {
                  setAviso(null);
                  const r = await duplicar(a.id);
                  if (!r.ok) setAviso(r.message);
                }}
                onDelete={async () => {
                  setAviso(null);
                  const r = await apagar(a.id);
                  if (!r.ok) setAviso(r.message);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {nova && (
        <NovaAutomacao
          busy={busy}
          onClose={() => setNova(false)}
          onCriar={async (dados) => {
            const r = await criar(dados);
            // AU-14: nomear e cair no quadro. O gatilho é a primeira decisão do desenho, e ela
            // se toma vendo o fluxo — não num formulário antes de o quadro existir.
            if (r.ok && r.id !== undefined) {
              setNova(false);
              setAbertaId(r.id);
            }
            return r;
          }}
        />
      )}
    </main>
  );
}

function Linha({
  automation,
  busy,
  onOpen,
  onToggle,
  onDuplicate,
  onDelete,
}: {
  automation: Automation;
  busy: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  // AU-14: o gatilho é o bloco que está no quadro. A coluna lê o desenho, que é a verdade —
  // a linha só guarda a cópia por onde os eventos procuram.
  const noQuadro = automation.graph.nodes.find((no) => no.kind === 'trigger');
  const gatilho = GATILHOS.find((g) => g.type === noQuadro?.type);

  return (
    <div className="tbl-row">
      <button type="button" className="auto-name" onClick={onOpen}>
        <span className="cell-name">{automation.name}</span>
        <span className="cell-sub">
          {automation.description ?? `${automation.graph.edges.length} ligações`}
        </span>
      </button>
      <span className={gatilho ? 'cell-name' : 'cell-sub'}>
        {gatilho?.label ?? 'Sem gatilho ainda'}
      </span>
      <span className="col-num mono">{automation.graph.nodes.length}</span>
      {/*
       * O interruptor é o estado e a ação na mesma coisa — desligar é um clique, sem
       * confirmação: quando uma automação está errada, parar tem que ser o gesto mais fácil
       * da tela. O trilho ligado usa o accent do tenant, que é cor de interface; verde aqui
       * mentiria sobre dinheiro.
       */}
      <span className="col-center">
        <input
          type="checkbox"
          className="switch"
          aria-label={`Ligar ${automation.name}`}
          checked={automation.enabled}
          disabled={busy}
          onChange={onToggle}
        />
      </span>
      <span className="auto-row-actions">
        {/*
         * AU-26 — duplicar fica ao lado de apagar porque as duas são o que se faz com uma
         * automação inteira. Vale com ela ligada: copiar não mexe no que está rodando.
         */}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={onDuplicate}
        >
          Duplicar
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm btn-danger"
          disabled={busy || automation.enabled}
          title={automation.enabled ? 'Desligue antes de apagar' : undefined}
          onClick={onDelete}
        >
          Apagar
        </button>
      </span>
    </div>
  );
}

function NovaAutomacao({
  busy,
  onClose,
  onCriar,
}: {
  busy: boolean;
  onClose: () => void;
  onCriar: (dados: {
    name: string;
    description?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
}): React.JSX.Element {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async () => {
    setErro(null);
    const r = await onCriar({
      name: nome.trim(),
      ...(descricao.trim() ? { description: descricao.trim() } : {}),
    });
    if (!r.ok) setErro(r.message ?? 'Não foi possível criar.');
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Criar automação">
      <div className="modal">
        <h2 className="modal-title">Criar automação</h2>
        <p className="modal-sub">
          Dê um nome e o quadro abre em seguida. O gatilho é o primeiro bloco a pôr lá.
        </p>

        {erro && (
          <div className="feedback feedback-error form-alert" role="alert">
            <span className="feedback-dot" />
            <span>{erro}</span>
          </div>
        )}

        <div className="form-grid">
          <label className="field field-wide">
            <span className="field-label">Nome</span>
            <input
              className="field-input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Responder quem pergunta preço"
            />
          </label>
          <label className="field field-wide">
            <span className="field-label">Descrição</span>
            <input
              className="field-input"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Opcional — para a equipe entender o que ela faz"
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
            Voltar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || nome.trim() === ''}
            onClick={() => void enviar()}
          >
            {busy ? 'Criando…' : 'Criar automação'}
          </button>
        </div>
      </div>
    </div>
  );
}

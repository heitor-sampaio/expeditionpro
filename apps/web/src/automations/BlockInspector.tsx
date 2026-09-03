import { switchCases, type ContextField, type SwitchCase } from '@expedition/domain';
import { blockLabel, CAMPOS, type BlockField } from './blocks.js';
import { camposDoGatilho, gatilhoDoQuadro } from './fields.js';
import type { BlockNodeType } from './BlockNode.js';

/**
 * AU-01 · AU-16 — o inspetor do bloco selecionado.
 *
 * Não sabe nada de bloco nenhum: desenha os campos que `CAMPOS` descreve. Bloco novo entra
 * no catálogo e aparece aqui sem uma linha de código a mais — que é o ponto de ter o catálogo
 * separado da tela.
 *
 * Os campos disponíveis chegam de fora, do editor, porque metade deles vem do desenho aberto
 * (as variáveis que o fluxo define) e o inspetor não conhece o quadro inteiro.
 */
export function BlockInspector({
  node,
  campos: disponiveis,
  readOnly,
  onChange,
  onDelete,
}: {
  node: BlockNodeType | null;
  campos: readonly ContextField[];
  readOnly: boolean;
  onChange: (config: Record<string, unknown>) => void;
  onDelete: () => void;
}): React.JSX.Element {
  if (node === null) {
    return (
      <aside className="inbox-side">
        <span className="inbox-side-title">Bloco</span>
        <p className="field-help">
          Escolha um bloco no quadro para configurar. Arraste da biblioteca para acrescentar, e
          ligue a saída de um bloco na entrada do próximo.
        </p>
      </aside>
    );
  }

  const campos = CAMPOS[node.data.type] ?? [];
  const gatilho = node.type === 'trigger';

  return (
    <aside className="inbox-side">
      <div className="inbox-side-id">
        <span className="card-title">{blockLabel(node.data.type)}</span>
      </div>

      {campos.length === 0 && (
        <p className="field-help">
          {gatilho
            ? 'O gatilho não tem o que configurar: ele só diz quando a automação começa.'
            : 'Este bloco não tem configuração.'}
        </p>
      )}

      {campos.map((campo) => (
        <Campo
          key={campo.key}
          campo={campo}
          valor={node.data.config[campo.key]}
          disponiveis={disponiveis}
          readOnly={readOnly}
          onChange={(valor) => onChange({ ...node.data.config, [campo.key]: valor })}
        />
      ))}

      {gatilho && <CamposDoGatilho type={node.data.type} />}

      <div className="inbox-side-block">
        <button
          type="button"
          className="btn btn-secondary btn-sm btn-danger"
          disabled={readOnly}
          onClick={onDelete}
        >
          Remover bloco
        </button>
      </div>
    </aside>
  );
}

/**
 * AU-16 — o que este gatilho traz, listado no próprio inspetor dele.
 *
 * Quem escolhe o gatilho está decidindo, sem saber, quais campos vai ter adiante. Ver a lista
 * na hora da escolha é o que evita desenhar um fluxo inteiro que precisa de `contato.nome`
 * pendurado num gatilho que só entrega o id da inscrição.
 */
function CamposDoGatilho({ type }: { type: string }): React.JSX.Element | null {
  const conhecido = gatilhoDoQuadro([{ type: 'trigger', data: { type, config: {} } }]);
  if (conhecido === null) return null;
  const campos = camposDoGatilho(conhecido);

  return (
    <div className="inbox-side-block">
      <span className="field-label">Campos que este gatilho traz</span>
      <ul className="auto-fieldlist">
        {campos.map((campo) => (
          <li key={campo.path}>
            <span className="auto-field-path">{campo.path}</span>
            <span className="cell-sub">{campo.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Campo({
  campo,
  valor,
  disponiveis,
  readOnly,
  onChange,
}: {
  campo: BlockField;
  valor: unknown;
  disponiveis: readonly ContextField[];
  readOnly: boolean;
  onChange: (valor: unknown) => void;
}): React.JSX.Element {
  const texto = valor === undefined || valor === null ? '' : String(valor);

  if (campo.kind === 'cases') {
    return (
      <ListaDeValores
        campo={campo}
        casos={switchCases({ cases: valor })}
        readOnly={readOnly}
        onChange={onChange}
      />
    );
  }

  return (
    <label className="field">
      <span className="field-label">{campo.label}</span>

      {campo.kind === 'path' ? (
        <SeletorDeCampo
          valor={texto}
          disponiveis={disponiveis}
          readOnly={readOnly}
          onChange={onChange}
        />
      ) : campo.kind === 'textarea' ? (
        <textarea
          className="field-input field-textarea"
          rows={4}
          value={texto}
          disabled={readOnly}
          placeholder={campo.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : campo.kind === 'select' ? (
        <select
          className="field-input"
          value={texto}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        >
          {(campo.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="field-input"
          type={campo.kind === 'number' ? 'number' : 'text'}
          inputMode={campo.kind === 'number' ? 'numeric' : undefined}
          value={texto}
          disabled={readOnly}
          placeholder={campo.placeholder}
          onChange={(e) =>
            onChange(campo.kind === 'number' ? numero(e.target.value) : e.target.value)
          }
        />
      )}

      {campo.template === true && (
        <InserirCampo
          disponiveis={disponiveis}
          readOnly={readOnly}
          onInserir={(caminho) => onChange(`${texto}{{${caminho}}}`)}
        />
      )}
      {campo.help && <span className="field-help">{campo.help}</span>}
    </label>
  );
}

/**
 * AU-16 — o campo do contexto, escolhido em vez de digitado.
 *
 * O escrito à mão continua possível, e por dois motivos: um grafo salvo antes desta tela pode
 * ter um caminho que não está na lista, e some da tela o que não se reconhece seria apagar o
 * trabalho de alguém. A opção "outro" é o caminho para isso, e o valor atual entra na lista
 * quando não é nenhum dos oferecidos.
 */
function SeletorDeCampo({
  valor,
  disponiveis,
  readOnly,
  onChange,
}: {
  valor: string;
  disponiveis: readonly ContextField[];
  readOnly: boolean;
  onChange: (valor: string) => void;
}): React.JSX.Element {
  const conhecido = disponiveis.some((campo) => campo.path === valor);

  return (
    <>
      <select
        className="field-input"
        value={conhecido ? valor : OUTRO}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value === OUTRO ? '' : e.target.value)}
      >
        <option value="">Escolha um campo</option>
        {disponiveis.map((campo) => (
          <option key={campo.path} value={campo.path}>
            {campo.path} — {campo.label}
          </option>
        ))}
        <option value={OUTRO}>Outro campo…</option>
      </select>

      {!conhecido && valor !== '' && (
        <input
          className="field-input"
          value={valor}
          disabled={readOnly}
          placeholder="mensagem.texto"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {!conhecido && valor === '' && disponiveis.length === 0 && (
        <span className="field-help">
          Ponha o bloco de gatilho no quadro para ver os campos que ele traz.
        </span>
      )}
    </>
  );
}

const OUTRO = '__outro__';

/**
 * AU-15 — a lista de valores da escolha múltipla.
 *
 * Cada valor tem id próprio, e o id é a saída no quadro: apagar o primeiro valor não pode
 * fazer a ligação do segundo passar a apontar para o terceiro. É por isso que remover mexe na
 * lista pelo id, e nunca por posição.
 */
function ListaDeValores({
  campo,
  casos,
  readOnly,
  onChange,
}: {
  campo: BlockField;
  casos: readonly SwitchCase[];
  readOnly: boolean;
  onChange: (valor: unknown) => void;
}): React.JSX.Element {
  const trocar = (id: string, value: string) =>
    onChange(casos.map((caso) => (caso.id === id ? { ...caso, value } : caso)));

  return (
    <div className="field">
      <span className="field-label">{campo.label}</span>

      {casos.length === 0 && (
        <span className="field-help">Sem valor nenhum, todo mundo sai pelo padrão.</span>
      )}

      {casos.map((caso) => (
        <div key={caso.id} className="auto-case">
          <input
            className="field-input"
            value={caso.value}
            disabled={readOnly}
            placeholder="preço"
            aria-label="Valor"
            onChange={(e) => trocar(caso.id, e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-danger"
            disabled={readOnly}
            onClick={() => onChange(casos.filter((outro) => outro.id !== caso.id))}
          >
            Remover
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={readOnly}
        onClick={() => onChange([...casos, { id: crypto.randomUUID().slice(0, 8), value: '' }])}
      >
        Acrescentar valor
      </button>

      {campo.help && <span className="field-help">{campo.help}</span>}
    </div>
  );
}

/** AU-09 · AU-16 — põe `{{campo}}` no texto sem exigir que alguém saiba o nome de cor. */
function InserirCampo({
  disponiveis,
  readOnly,
  onInserir,
}: {
  disponiveis: readonly ContextField[];
  readOnly: boolean;
  onInserir: (caminho: string) => void;
}): React.JSX.Element | null {
  if (disponiveis.length === 0) return null;

  return (
    <select
      className="field-input auto-insert"
      value=""
      disabled={readOnly}
      aria-label="Inserir campo no texto"
      onChange={(e) => {
        if (e.target.value !== '') onInserir(e.target.value);
      }}
    >
      <option value="">Inserir campo…</option>
      {disponiveis.map((campo) => (
        <option key={campo.path} value={campo.path}>
          {campo.path} — {campo.label}
        </option>
      ))}
    </select>
  );
}

/** Campo numérico vazio vira zero, não `NaN` — `NaN` não sobrevive ao JSON do grafo. */
function numero(bruto: string): number {
  const n = Number(bruto);
  return Number.isFinite(n) ? n : 0;
}

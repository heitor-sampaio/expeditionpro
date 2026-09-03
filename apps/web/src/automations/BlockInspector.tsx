import { blockLabel, CAMPOS, type BlockField } from './blocks.js';
import type { BlockNodeType } from './BlockNode.js';

/**
 * AU-01 — o inspetor do bloco selecionado.
 *
 * Não sabe nada de bloco nenhum: desenha os campos que `CAMPOS` descreve. Bloco novo entra
 * no catálogo e aparece aqui sem uma linha de código a mais — que é o ponto de ter o catálogo
 * separado da tela.
 */
export function BlockInspector({
  node,
  readOnly,
  onChange,
  onDelete,
}: {
  node: BlockNodeType | null;
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
          readOnly={readOnly}
          onChange={(valor) => onChange({ ...node.data.config, [campo.key]: valor })}
        />
      ))}

      {/* O gatilho é a porta de entrada do fluxo: apagá-lo deixaria a automação sem começo. */}
      {!gatilho && (
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
      )}
    </aside>
  );
}

function Campo({
  campo,
  valor,
  readOnly,
  onChange,
}: {
  campo: BlockField;
  valor: unknown;
  readOnly: boolean;
  onChange: (valor: unknown) => void;
}): React.JSX.Element {
  const texto = valor === undefined || valor === null ? '' : String(valor);

  return (
    <label className="field">
      <span className="field-label">{campo.label}</span>

      {campo.kind === 'textarea' ? (
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

      {campo.help && <span className="field-help">{campo.help}</span>}
    </label>
  );
}

/** Campo numérico vazio vira zero, não `NaN` — `NaN` não sobrevive ao JSON do grafo. */
function numero(bruto: string): number {
  const n = Number(bruto);
  return Number.isFinite(n) ? n : 0;
}

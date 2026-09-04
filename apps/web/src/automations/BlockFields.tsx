import {
  searchFilters,
  switchCases,
  type ContextField,
  type SearchFilter,
  type SwitchCase,
} from '@expedition/domain';
import { CAMPOS, type BlockField } from './blocks.js';
import { camposDoGatilho, gatilhoDoQuadro } from './fields.js';

/**
 * AU-01 · AU-16 — a configuração de um bloco, desenhada **dentro do próprio bloco**.
 *
 * Era uma coluna à direita do quadro, e a coluna custava duas coisas: espaço que o quadro
 * queria, e a viagem do olho entre o bloco selecionado e o formulário longe dele. Configurar
 * onde a coisa está é o que deixa ler o fluxo e mexer nele no mesmo lugar.
 *
 * Continua não sabendo nada de bloco nenhum: desenha os campos que `CAMPOS` descreve. Bloco
 * novo entra no catálogo e aparece aqui sem uma linha de código a mais.
 */
export function BlockFields({
  type,
  config,
  campos: disponiveis,
  readOnly,
  onChange,
}: {
  type: string;
  config: Record<string, unknown>;
  campos: readonly ContextField[];
  readOnly: boolean;
  onChange: (config: Record<string, unknown>) => void;
}): React.JSX.Element {
  const campos = CAMPOS[type] ?? [];
  const doGatilho = gatilhoDoQuadro([{ type: 'trigger', data: { type, config } }]);

  return (
    <div className="auto-node-form">
      {campos.length === 0 && doGatilho === null && (
        <span className="field-help">Este bloco não tem configuração.</span>
      )}

      {campos.map((campo) => (
        <Campo
          key={campo.key}
          campo={campo}
          valor={config[campo.key]}
          disponiveis={disponiveis}
          readOnly={readOnly}
          onChange={(valor) => onChange({ ...config, [campo.key]: valor })}
        />
      ))}

      {doGatilho !== null && <CamposDoGatilho type={doGatilho} />}
    </div>
  );
}

/**
 * AU-16 — o que este gatilho traz, listado no próprio bloco de gatilho.
 *
 * Quem escolhe o gatilho está decidindo, sem saber, quais campos vai ter adiante. Ver a lista
 * na hora da escolha é o que evita desenhar um fluxo inteiro que precisa de `contato.nome`
 * pendurado num gatilho que só entrega o id da inscrição.
 */
function CamposDoGatilho({
  type,
}: {
  type: Parameters<typeof camposDoGatilho>[0];
}): React.JSX.Element {
  return (
    <div className="auto-node-block">
      <span className="field-label">Campos que este gatilho traz</span>
      <ul className="auto-fieldlist">
        {camposDoGatilho(type).map((campo) => (
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

  if (campo.kind === 'filters') {
    return (
      <ListaDeFiltros
        campo={campo}
        filtros={searchFilters({ filters: valor })}
        disponiveis={disponiveis}
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
          className="field-input field-textarea nodrag nowheel"
          rows={3}
          value={texto}
          disabled={readOnly}
          placeholder={campo.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : campo.kind === 'select' ? (
        <select
          className="field-input nodrag"
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
          className="field-input nodrag"
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
 * ter um caminho que não está na lista, e sumir da tela o que não se reconhece seria apagar o
 * trabalho de alguém. A opção "outro" é o caminho para isso.
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
  // Campo ainda em branco não é "outro campo": é o convite a escolher um.
  const conhecido = valor === '' || disponiveis.some((campo) => campo.path === valor);

  return (
    <>
      <select
        className="field-input nodrag"
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
          className="field-input nodrag"
          value={valor}
          disabled={readOnly}
          placeholder="mensagem.texto"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {disponiveis.length === 0 && (
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
            className="field-input nodrag"
            value={caso.value}
            disabled={readOnly}
            placeholder="preço"
            aria-label="Valor"
            onChange={(e) => trocar(caso.id, e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-danger nodrag"
            disabled={readOnly}
            onClick={() => onChange(casos.filter((outro) => outro.id !== caso.id))}
          >
            Remover
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-secondary btn-sm nodrag"
        disabled={readOnly}
        onClick={() => onChange([...casos, { id: crypto.randomUUID().slice(0, 8), value: '' }])}
      >
        Acrescentar valor
      </button>

      {campo.help && <span className="field-help">{campo.help}</span>}
    </div>
  );
}

/**
 * AU-18 — os filtros da busca: campo, comparação e valor, na linguagem do bloco "Se".
 *
 * É de propósito que a linha aqui seja igual à do "Se": quem já entendeu a condição não precisa
 * aprender outra gramática para filtrar uma lista. E os operadores são os mesmos porque quem
 * decide é a mesma função — filtrar e perguntar não podem discordar.
 */
function ListaDeFiltros({
  campo,
  filtros,
  disponiveis,
  readOnly,
  onChange,
}: {
  campo: BlockField;
  filtros: readonly SearchFilter[];
  disponiveis: readonly ContextField[];
  readOnly: boolean;
  onChange: (valor: unknown) => void;
}): React.JSX.Element {
  const trocar = (id: string, patch: Partial<SearchFilter>) =>
    onChange(filtros.map((filtro) => (filtro.id === id ? { ...filtro, ...patch } : filtro)));

  return (
    <div className="field">
      <span className="field-label">{campo.label}</span>

      {filtros.length === 0 && (
        <span className="field-help">Sem filtro nenhum, percorre a lista inteira.</span>
      )}

      {filtros.map((filtro) => (
        <div key={filtro.id} className="auto-filter">
          <SeletorDeCampo
            valor={filtro.field}
            disponiveis={disponiveis}
            readOnly={readOnly}
            onChange={(field) => trocar(filtro.id, { field })}
          />
          <div className="auto-filter-line">
            <select
              className="field-input nodrag"
              value={filtro.operator}
              disabled={readOnly}
              aria-label="Comparação"
              onChange={(e) => trocar(filtro.id, { operator: e.target.value })}
            >
              {OPERADORES.map((operador) => (
                <option key={operador.value} value={operador.value}>
                  {operador.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-danger nodrag"
              disabled={readOnly}
              onClick={() => onChange(filtros.filter((outro) => outro.id !== filtro.id))}
            >
              Remover
            </button>
          </div>
          {/* "Está vazio" e "não está vazio" não comparam com nada: o campo some. */}
          {filtro.operator !== 'empty' && filtro.operator !== 'not_empty' && (
            <>
              <input
                className="field-input nodrag"
                value={filtro.value}
                disabled={readOnly}
                placeholder="valor"
                aria-label="Valor"
                onChange={(e) => trocar(filtro.id, { value: e.target.value })}
              />
              {/* AU-19: o valor aceita variável — é assim que se procura pelo contato do gatilho. */}
              <InserirCampo
                disponiveis={disponiveis}
                readOnly={readOnly}
                onInserir={(caminho) =>
                  trocar(filtro.id, { value: `${filtro.value}{{${caminho}}}` })
                }
              />
            </>
          )}
        </div>
      ))}

      <button
        type="button"
        className="btn btn-secondary btn-sm nodrag"
        disabled={readOnly}
        onClick={() =>
          onChange([
            ...filtros,
            { id: crypto.randomUUID().slice(0, 8), field: '', operator: 'equals', value: '' },
          ])
        }
      >
        Acrescentar filtro
      </button>

      {campo.help && <span className="field-help">{campo.help}</span>}
    </div>
  );
}

/** As comparações, iguais às do bloco "Se" — e as numéricas, que o filtro trouxe (AU-18). */
const OPERADORES = [
  { value: 'equals', label: 'é igual a' },
  { value: 'not_equals', label: 'é diferente de' },
  { value: 'contains', label: 'contém' },
  { value: 'greater_than', label: 'é maior que' },
  { value: 'less_than', label: 'é menor que' },
  { value: 'empty', label: 'está vazio' },
  { value: 'not_empty', label: 'não está vazio' },
] as const;

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
      className="field-input auto-insert nodrag"
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

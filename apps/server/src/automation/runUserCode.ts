import { createContext, runInContext } from 'node:vm';

/**
 * AU-23 — o pedaço de JavaScript que a equipe escreve dentro de um fluxo.
 *
 * Existe porque nenhum catálogo de blocos cobre tudo: somar um campo, montar o corpo de um
 * webhook, decidir por uma regra que só aquela operação tem. O resto do módulo é feito de
 * blocos fechados de propósito; este é a válvula de escape, e vale a pena porque a alternativa
 * é a equipe pedir um bloco novo a cada mês.
 *
 * **Isolamento e até onde ele vai.** O contexto nasce sem protótipo e sem nada dentro: não há
 * `require`, `process`, `fetch` nem timer. Os dados entram **serializados** e são desembrulhados
 * lá dentro, porque objeto do host passado direto é a porta de saída mais conhecida que existe
 * (`({}).constructor.constructor('return process')()` alcança o host quando o objeto é do
 * host). Gerar código está desligado, o que fecha essa porta de novo por outro lado. O retorno
 * volta como texto JSON, então nenhuma referência do sandbox atravessa.
 *
 * Isso torna o escape difícil, **não impossível**: `node:vm` isola o escopo, não o processo.
 * A guarda de verdade é quem pode escrever o código — hoje, alguém da equipe do tenant, que já
 * tem acesso de administrador. No dia em que houver tenant que não se confia, a troca certa é
 * `isolated-vm` ou um processo separado, e não mais um remendo aqui.
 */

export interface RunCodeOptions {
  /** Prazo curto: automação presa num laço trava a fila inteira atrás dela. */
  readonly timeoutMs?: number;
}

const PRAZO_PADRAO_MS = 500;

/** Nó de fluxo, não módulo: o que passa disso é sinal de que a lógica não é de automação. */
const CODIGO_MAX_CHARS = 20_000;

export function runUserCode(
  codigo: string,
  dados: unknown,
  options: RunCodeOptions = {},
): Record<string, unknown> {
  if (codigo.trim() === '') throw new Error('o bloco de código está sem código');
  if (codigo.length > CODIGO_MAX_CHARS) {
    throw new Error(
      `o código está longo demais: o limite é ${String(CODIGO_MAX_CHARS)} caracteres`,
    );
  }

  const contexto = createContext(Object.create(null) as object, {
    codeGeneration: { strings: false, wasm: false },
  });

  const bruto = executar(codigo, dados, contexto, options.timeoutMs ?? PRAZO_PADRAO_MS);
  if (typeof bruto !== 'string') {
    throw new Error('o bloco de código precisa devolver um objeto, com `return { ... }`');
  }

  const saida: unknown = JSON.parse(bruto);
  if (saida === null || typeof saida !== 'object' || Array.isArray(saida)) {
    throw new Error('o bloco de código precisa devolver um objeto, com `return { ... }`');
  }
  return saida as Record<string, unknown>;
}

function executar(codigo: string, dados: unknown, contexto: object, prazo: number): unknown {
  const script = `JSON.stringify((function (dados) {\n${codigo}\n})(JSON.parse(${literal(dados)})))`;

  try {
    return runInContext(script, contexto, { timeout: prazo, displayErrors: true });
  } catch (error) {
    // Estouro de prazo vem como erro genérico do vm; sem esta tradução, quem desenhou o fluxo
    // lê "Script execution timed out" e não sabe que o problema é o laço que escreveu.
    const motivo = error instanceof Error ? error.message : String(error);
    if (/timed out/i.test(motivo)) {
      throw new Error(`o bloco de código passou do tempo de ${String(prazo)}ms`, { cause: error });
    }
    throw error instanceof Error ? error : new Error(motivo);
  }
}

/**
 * Os dados como literal de string dentro do script. `JSON.stringify` duas vezes é de propósito:
 * a primeira faz o JSON, a segunda faz dele uma string JavaScript válida. Os dois separadores
 * de linha do Unicode saem escapados porque já foram quebra de sintaxe em JavaScript e não
 * custam nada aqui.
 */
function literal(dados: unknown): string {
  return JSON.stringify(JSON.stringify(dados ?? {}))
    .replace(/\u2028/g, '\u2028')
    .replace(/\u2029/g, '\u2029');
}

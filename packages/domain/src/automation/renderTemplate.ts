/**
 * AU-09 · AU-22 — as variáveis e as funções dentro do texto que vai para o cliente.
 *
 * A regra que decide tudo: **o que não dá certo vira vazio, nunca o marcador cru**. Um erro de
 * quem escreveu a automação não pode virar "Bom dia, {{contato.nome}}" no WhatsApp de um
 * cliente — quem paga o vexame é a empresa, não quem digitou. Vale para variável que não
 * existe, função que não existe e argumento que não veio.
 *
 * Substituição em **uma passada só**, e por isso o valor de uma variável nunca é reinterpretado:
 * o que vem do contexto é dado de terceiro (nome de perfil do WhatsApp), e um contato chamado
 * `{{contato.telefone}}` não pode virar o telefone de ninguém.
 *
 * As funções são **nomeadas e poucas**, de propósito. Expressão que aceita qualquer coisa vira
 * linguagem, e linguagem dentro de um campo de texto é código sem revisão, sem teste e sem
 * ninguém que responda por ele. Quem precisa calcular de verdade tem o bloco de código, onde a
 * decisão de rodar código foi tomada de olhos abertos.
 */

/** `{{ caminho }}` ou `{{ funcao(arg, "literal") }}` — sem aninhar chamada dentro de chamada. */
const MARCADOR = /\{\{\s*([\w.]+)\s*(?:\(([^()]*)\))?\s*\}\}/g;

export interface RenderOptions {
  /** O relógio, para o que depende de "hoje". Ausente, essas funções devolvem vazio. */
  readonly agora?: Date;
}

export function renderTemplate(
  texto: string,
  contexto: Record<string, unknown>,
  options: RenderOptions = {},
): string {
  return texto.replace(MARCADOR, (_inteiro, nome: string, args: string | undefined) => {
    if (args === undefined) return valorDe(contexto, nome);

    const funcao = FUNCOES[nome];
    if (funcao === undefined) return '';
    return funcao(
      separar(args).map((arg) => argumento(arg, contexto)),
      options,
    );
  });
}

/**
 * Um argumento: literal entre aspas, ou caminho no contexto. Número escrito direto também é
 * literal — `padrao(x, 0)` é uma coisa que alguém vai escrever.
 */
function argumento(bruto: string, contexto: Record<string, unknown>): string {
  const limpo = bruto.trim();
  if (/^".*"$/s.test(limpo) || /^'.*'$/s.test(limpo)) return limpo.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(limpo)) return limpo;
  return valorDe(contexto, limpo);
}

/** Vírgula separa, menos dentro de aspas: `padrao(x, "olá, tudo bem")` é um argumento só. */
function separar(args: string): string[] {
  const partes: string[] = [];
  let atual = '';
  let aspas: string | null = null;

  for (const char of args) {
    if (aspas !== null) {
      if (char === aspas) aspas = null;
      atual += char;
      continue;
    }
    if (char === '"' || char === "'") {
      aspas = char;
      atual += char;
      continue;
    }
    if (char === ',') {
      partes.push(atual);
      atual = '';
      continue;
    }
    atual += char;
  }
  if (atual.trim() !== '') partes.push(atual);
  return partes;
}

type FuncaoDeTexto = (args: readonly string[], options: RenderOptions) => string;

const FUNCOES: Record<string, FuncaoDeTexto> = {
  primeiroNome: ([nome]) => (nome ?? '').trim().split(/\s+/)[0] ?? '',

  /** Preposição fica minúscula: "Joao da Silva", e não "Joao Da Silva". */
  nomeProprio: ([nome]) =>
    (nome ?? '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((parte) => parte !== '')
      .map((parte, i) =>
        i > 0 && PREPOSICOES.has(parte) ? parte : parte.charAt(0).toUpperCase() + parte.slice(1),
      )
      .join(' '),

  maiuscula: ([texto]) => (texto ?? '').toUpperCase(),
  minuscula: ([texto]) => (texto ?? '').toLowerCase(),

  /** O primeiro que não estiver vazio. É como se escreve "Oi, {{padrao(nome, 'tudo bem')}}". */
  padrao: (args) => args.find((arg) => arg.trim() !== '') ?? '',

  /** `2026-10-10` vira `10/10/2026`. O que não for data no formato do sistema vira vazio. */
  data: ([iso]) => {
    const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? '').trim());
    return partes ? `${partes[3]!}/${partes[2]!}/${partes[1]!}` : '';
  },

  /**
   * Quantos dias faltam para a data, a partir de hoje. Passado vira negativo — quem escreve o
   * texto decide o que dizer com isso, e arredondar para zero esconderia o atraso.
   */
  diasAte: ([iso], { agora }) => {
    if (agora === undefined) return '';
    const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? '').trim());
    if (partes === null) return '';
    const alvo = Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
    // O dia da operação, e não o do servidor: às 21h em Brasília o UTC já virou.
    const local = new Date(agora.getTime() - 3 * 3_600_000);
    const hoje = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    return String(Math.round((alvo - hoje) / 86_400_000));
  },

  /**
   * Centavos viram reais. Dinheiro é centavos no sistema inteiro (`Cents`), e escrever
   * "R$ 258000" numa mensagem seria o erro mais caro que um texto pode ter.
   */
  dinheiro: ([centavos]) => {
    const valor = Number((centavos ?? '').trim());
    if (!Number.isFinite(valor)) return '';
    const inteiro = Math.trunc(Math.abs(valor) / 100);
    const resto = String(Math.abs(valor) % 100).padStart(2, '0');
    const comPonto = inteiro.toLocaleString('pt-BR');
    return `${valor < 0 ? '-' : ''}R$ ${comPonto},${resto}`;
  },
};

const PREPOSICOES = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

function valorDe(contexto: Record<string, unknown>, caminho: string): string {
  let atual: unknown = contexto;
  for (const parte of caminho.split('.')) {
    // Atravessar o que não é objeto devolve vazio: `contato.nome.sobrenome` não existe, e
    // inventar um valor ali seria pior que não dizer nada.
    if (atual === null || typeof atual !== 'object') return '';
    atual = (atual as Record<string, unknown>)[parte];
  }
  if (atual === null || atual === undefined) return '';
  return typeof atual === 'object' ? '' : String(atual);
}

/** AU-22 — o que a tela oferece na ajuda do campo. Nome e para que serve, nada mais. */
export const FUNCOES_DE_TEXTO: readonly { readonly nome: string; readonly ajuda: string }[] = [
  { nome: 'primeiroNome', ajuda: 'primeiroNome(contato.nome) → Ana' },
  { nome: 'nomeProprio', ajuda: 'nomeProprio(contato.nome) → Ana Prado' },
  { nome: 'maiuscula', ajuda: 'maiuscula(texto)' },
  { nome: 'minuscula', ajuda: 'minuscula(texto)' },
  { nome: 'padrao', ajuda: 'padrao(campo, "quando vazio")' },
  { nome: 'data', ajuda: 'data(saida.inicio) → 10/10/2026' },
  { nome: 'diasAte', ajuda: 'diasAte(saida.inicio) → 3' },
  { nome: 'dinheiro', ajuda: 'dinheiro(centavos) → R$ 2.580,00' },
];

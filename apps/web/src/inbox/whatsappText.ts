/**
 * AT-07 — a formatação nativa do WhatsApp, lida.
 *
 * O texto chega cru: `*combinado*` com os asteriscos, listas como um monte de traços. Quem
 * escreveu do outro lado **viu formatado** no aparelho, e mostrar outra coisa aqui é a mesma
 * mensagem com duas aparências.
 *
 * São seis marcações, e todas entram: meia interpretação é pior que nenhuma, porque o que
 * ficar de fora aparece com o símbolo solto no meio do texto já formatado.
 *
 * **Devolve uma árvore, não HTML.** O React monta os elementos a partir dela, então texto de
 * terceiro nunca vira marcação executável — e a conversa é o lugar mais óbvio para alguém
 * tentar. Função pura: testar formatação não precisa montar componente.
 */

export type Inline =
  | { readonly kind: 'text'; readonly text: string }
  | {
      readonly kind: 'bold' | 'italic' | 'strike' | 'code';
      readonly children: readonly Inline[];
    };

export type Block =
  | { readonly kind: 'paragraph'; readonly children: readonly Inline[] }
  | { readonly kind: 'quote'; readonly children: readonly Inline[] }
  | { readonly kind: 'bullet'; readonly items: readonly (readonly Inline[])[] }
  | {
      readonly kind: 'ordered';
      readonly start: number;
      readonly items: readonly (readonly Inline[])[];
    }
  | { readonly kind: 'pre'; readonly text: string };

const MARCADOR: Record<string, 'bold' | 'italic' | 'strike' | 'code'> = {
  '*': 'bold',
  _: 'italic',
  '~': 'strike',
  '`': 'code',
};

const CITACAO = /^>\s?(.*)$/;
const ITEM = /^[-*]\s+(.+)$/;
const NUMERADO = /^(\d+)[.)]\s+(.+)$/;

export function parseWhatsAppText(texto: string): Block[] {
  const blocos: Block[] = [];

  // O bloco de três crases vem primeiro: dentro dele nada mais é marcação, nem quebra de
  // linha separa parágrafo.
  for (const [i, pedaco] of texto.split('```').entries()) {
    if (i % 2 === 1) {
      const conteudo = pedaco.replace(/^\n/, '').replace(/\n$/, '');
      if (conteudo !== '') blocos.push({ kind: 'pre', text: conteudo });
      continue;
    }
    blocos.push(...blocosDeLinhas(pedaco));
  }
  return blocos;
}

function blocosDeLinhas(trecho: string): Block[] {
  const blocos: Block[] = [];
  const linhas = trecho.split('\n');

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i]!;
    if (linha.trim() === '') continue;

    const citacao = CITACAO.exec(linha);
    if (citacao) {
      blocos.push({ kind: 'quote', children: parseInline(citacao[1] ?? '') });
      continue;
    }

    // Listas juntam linhas seguidas: cada item numa linha, um bloco só na tela.
    const numerado = NUMERADO.exec(linha);
    if (numerado) {
      const items: Inline[][] = [];
      let j = i;
      let atual: RegExpExecArray | null = numerado;
      while (atual) {
        items.push(parseInline(atual[2] ?? ''));
        j += 1;
        const proxima = linhas[j];
        atual = proxima === undefined ? null : NUMERADO.exec(proxima);
      }
      blocos.push({ kind: 'ordered', start: Number(numerado[1]), items });
      i = j - 1;
      continue;
    }

    const item = ITEM.exec(linha);
    if (item) {
      const items: Inline[][] = [];
      let j = i;
      let atual: RegExpExecArray | null = item;
      while (atual) {
        items.push(parseInline(atual[1] ?? ''));
        j += 1;
        const proxima = linhas[j];
        atual = proxima === undefined ? null : ITEM.exec(proxima);
      }
      blocos.push({ kind: 'bullet', items });
      i = j - 1;
      continue;
    }

    blocos.push({ kind: 'paragraph', children: parseInline(linha) });
  }
  return blocos;
}

/**
 * A marcação **abre colada** no texto e **fecha colada** nele. É a regra do WhatsApp, e é o
 * que impede "2 * 3 * 4" de virar negrito comendo meia mensagem.
 */
function parseInline(texto: string): Inline[] {
  const saida: Inline[] = [];
  let buffer = '';
  let i = 0;

  const despejar = () => {
    if (buffer !== '') {
      saida.push({ kind: 'text', text: buffer });
      buffer = '';
    }
  };

  while (i < texto.length) {
    const ch = texto[i]!;
    const kind = MARCADOR[ch];
    const fim = kind === undefined ? -1 : fechamento(texto, i, ch);

    if (kind !== undefined && fim > i + 1) {
      despejar();
      const dentro = texto.slice(i + 1, fim);
      saida.push({
        kind,
        // Monoespaçado é literal: é justamente onde se põe um asterisco sem virar negrito.
        children: kind === 'code' ? [{ kind: 'text', text: dentro }] : parseInline(dentro),
      });
      i = fim + 1;
      continue;
    }

    buffer += ch;
    i += 1;
  }

  despejar();
  return saida;
}

/** Onde a marcação fecha, ou `-1` se ela nunca fecha — aí o caractere é só um caractere. */
function fechamento(texto: string, abertura: number, marcador: string): number {
  const depois = texto[abertura + 1];
  if (depois === undefined || /\s/.test(depois)) return -1;

  const antes = texto[abertura - 1];
  // Colado a uma letra, o marcador é parte da palavra (`fim_de_semana`), não uma abertura.
  if (antes !== undefined && /[\p{L}\p{N}]/u.test(antes)) return -1;

  for (let i = abertura + 2; i < texto.length; i += 1) {
    if (texto[i] !== marcador) continue;
    if (/\s/.test(texto[i - 1] ?? '')) continue;
    return i;
  }
  return -1;
}

/**
 * Parser do subset de markdown usado nas duas caixas de texto do produto (§5.12, RO-01).
 * Puro: devolve blocos e tokens, e quem renderiza é o `RichText` — nada de HTML cru.
 *
 * O `#` é ambíguo entre os dois usos, então o **modo** decide:
 * - `hashtags` (comunidade): `#palavra` é hashtag; `# ` no começo da linha é texto.
 * - `headings` (descrição do roteiro): `# `, `## `, `### ` são títulos; não há hashtag.
 *
 * Quebra de linha é preservada: linha em branco separa parágrafos, Enter simples quebra a
 * linha dentro do parágrafo — é o que o autor vê enquanto digita.
 */

export type RichTextMode = 'hashtags' | 'headings';

export type Block =
  | { readonly type: 'p'; readonly lines: string[] }
  | { readonly type: 'ul'; readonly items: string[] }
  | { readonly type: 'h'; readonly level: 1 | 2 | 3; readonly text: string };

export type InlineToken = {
  readonly kind: 'text' | 'strong' | 'em' | 'tag';
  readonly text: string;
};

const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^-\s+(.*)$/;
const INLINE_WITH_TAGS = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(_([^_]+)_)|(#[\p{L}\p{N}_]+)/gu;
const INLINE_PLAIN = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(_([^_]+)_)/gu;

export function parseBlocks(raw: string, mode: RichTextMode): Block[] {
  const blocks: Block[] = [];
  // Blocos "abertos" continuam recebendo as próximas linhas; uma linha em branco fecha
  // os dois, e é isso que faz o Enter duplo virar parágrafo novo.
  let openParagraph: { type: 'p'; lines: string[] } | null = null;
  let openList: { type: 'ul'; items: string[] } | null = null;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();

    if (trimmed === '') {
      openParagraph = null;
      openList = null;
      continue;
    }

    const heading = mode === 'headings' ? HEADING.exec(trimmed) : null;
    if (heading) {
      blocks.push({
        type: 'h',
        level: Math.min(3, heading[1]!.length) as 1 | 2 | 3,
        text: heading[2]!,
      });
      openParagraph = null;
      openList = null;
      continue;
    }

    const item = LIST_ITEM.exec(trimmed);
    if (item) {
      if (openList) openList.items.push(item[1]!);
      else {
        openList = { type: 'ul', items: [item[1]!] };
        blocks.push(openList);
      }
      openParagraph = null;
      continue;
    }

    if (openParagraph) openParagraph.lines.push(line);
    else {
      openParagraph = { type: 'p', lines: [line] };
      blocks.push(openParagraph);
    }
    openList = null;
  }

  return blocks;
}

export function parseInline(text: string, mode: RichTextMode): InlineToken[] {
  const pattern = mode === 'hashtags' ? INLINE_WITH_TAGS : INLINE_PLAIN;
  const tokens: InlineToken[] = [];
  let last = 0;

  for (const m of text.matchAll(pattern)) {
    const idx = m.index;
    if (idx > last) push(tokens, { kind: 'text', text: text.slice(last, idx) });
    if (m[2] !== undefined) push(tokens, { kind: 'strong', text: m[2] });
    else if (m[4] !== undefined) push(tokens, { kind: 'em', text: m[4] });
    else if (m[6] !== undefined) push(tokens, { kind: 'em', text: m[6] });
    else if (m[7] !== undefined) push(tokens, { kind: 'tag', text: m[7] });
    last = idx + m[0].length;
  }
  if (last < text.length) push(tokens, { kind: 'text', text: text.slice(last) });
  return tokens;
}

/** Junta texto adjacente: dois nós de texto seguidos são um só para quem lê. */
function push(tokens: InlineToken[], token: InlineToken): void {
  const last = tokens[tokens.length - 1];
  if (token.kind === 'text' && last && last.kind === 'text') {
    tokens[tokens.length - 1] = { kind: 'text', text: last.text + token.text };
    return;
  }
  tokens.push(token);
}

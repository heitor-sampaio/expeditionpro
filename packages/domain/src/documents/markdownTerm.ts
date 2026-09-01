/**
 * DOC-09 — Markdown → HTML **seguro por construção** (§5.13). Sem dependência: escapa
 * todo HTML do texto do admin primeiro e só introduz um conjunto fixo de tags a partir
 * da sintaxe markdown. Assim, `<script>` colado do Word vira texto, nunca execução na
 * sessão do cliente. Os marcadores `{{variavel}}` passam intactos (o `renderTermTemplate`
 * resolve depois). Subconjunto que um Termo precisa: títulos, parágrafos, negrito,
 * itálico, lista e link de esquema seguro.
 */

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

export function renderMarkdownToSafeHtml(markdown: string): string {
  const escaped = escapeHtml(markdown);
  const blocks = escaped.split(/\n{2,}/).map((b) => b.trim());
  return blocks
    .filter((b) => b.length > 0)
    .map(renderBlock)
    .join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderBlock(block: string): string {
  const heading = /^(#{1,3})\s+(.*)$/.exec(block);
  if (heading) {
    const level = heading[1]!.length;
    return `<h${level}>${inline(heading[2]!)}</h${level}>`;
  }
  const lines = block.split('\n');
  if (lines.every((line) => /^[-*]\s+/.test(line))) {
    const items = lines.map((line) => `<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`).join('');
    return `<ul>${items}</ul>`;
  }
  return `<p>${inline(lines.join(' '))}</p>`;
}

const MARKER_SPAN = /\{\{\s*[a-z_]+\s*\}\}/g;
// Sentinela não-imprimível (SOH): não aparece no texto escapado e não colide com dígitos
// reais do conteúdo (ex.: "capítulo 3"). Sem `*`/`_`, negrito/itálico o ignoram.
const STASH = String.fromCharCode(1);

/**
 * Formatação inline sobre texto **já escapado**: link seguro, negrito, itálico. Os
 * marcadores `{{variavel}}` são guardados atrás de um placeholder antes da formatação e
 * restaurados depois: o `_` de `cliente_nome` não vira itálico (senão o
 * `renderTermTemplate` não acha o marcador), e negrito/itálico **ao redor** do marcador
 * ainda funcionam.
 */
function inline(text: string): string {
  const markers: string[] = [];
  const stashed = text.replace(MARKER_SPAN, (marker) => {
    markers.push(marker);
    return `${STASH}${markers.length - 1}${STASH}`;
  });
  const formatted = italic(bold(links(stashed)));
  return formatted.replace(
    new RegExp(`${STASH}(\\d+)${STASH}`, 'g'),
    (_whole, index: string) => markers[Number(index)]!,
  );
}

function links(text: string): string {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (whole, label: string, url: string) =>
    SAFE_LINK.test(url) ? `<a href="${url}">${label}</a>` : whole,
  );
}

function bold(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function italic(text: string): string {
  return text
    .replace(/(^|[^*])\*(?!\*)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>');
}

import { parseBlocks, parseInline, type InlineToken, type RichTextMode } from './richTextParser.js';

/**
 * Renderiza o subset seguro de markdown (§5.12, RO-01) para elementos React — nunca
 * `dangerouslySetInnerHTML`, então nada do texto do usuário vira HTML.
 *
 * O modo decide o papel do `#`: na comunidade é hashtag; na descrição do roteiro, título.
 * Toda a análise está em `richTextParser.ts`; aqui só a montagem.
 */
export function RichText({
  text,
  mode = 'hashtags',
}: {
  readonly text: string;
  readonly mode?: RichTextMode;
}): React.JSX.Element {
  const blocks = parseBlocks(text, mode);

  return (
    <div className="richtext">
      {blocks.map((block, i) => {
        if (block.type === 'ul') {
          return (
            <ul key={i} className="rt-ul">
              {block.items.map((item, j) => (
                <li key={j}>{inline(item, mode)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'h') {
          const Heading = (['h1', 'h2', 'h3'] as const)[block.level - 1] ?? 'h3';
          return (
            <Heading key={i} className={`rt-h rt-h${block.level}`}>
              {inline(block.text, mode)}
            </Heading>
          );
        }
        return (
          <p key={i} className="rt-p">
            {block.lines.map((line, j) => (
              // Enter simples quebra a linha dentro do parágrafo, como o autor digitou.
              <span key={j}>
                {j > 0 && <br />}
                {inline(line, mode)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inline(text: string, mode: RichTextMode): React.ReactNode[] {
  return parseInline(text, mode).map((token, i) => node(token, i));
}

function node(token: InlineToken, key: number): React.ReactNode {
  if (token.kind === 'strong') return <strong key={key}>{token.text}</strong>;
  if (token.kind === 'em') return <em key={key}>{token.text}</em>;
  if (token.kind === 'tag')
    return (
      <span key={key} className="post-tag">
        {token.text}
      </span>
    );
  return token.text;
}

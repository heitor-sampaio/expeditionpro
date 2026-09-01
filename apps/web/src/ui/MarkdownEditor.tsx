import { useRef } from 'react';
import type { RichTextMode } from '../community/richTextParser.js';

/**
 * Editor de texto rico em markdown: textarea + botões físicos que aplicam markdown à
 * seleção — negrito, itálico, lista e, conforme o modo, título ou hashtag. O texto guardado
 * é markdown puro; a exibição usa <RichText> no mesmo modo.
 *
 * O `#` é ambíguo: na comunidade (`hashtags`) marca assunto e cola na palavra; na descrição
 * do roteiro (`headings`) abre título e precisa do espaço. O botão muda junto, senão o autor
 * escreve uma coisa e vê outra.
 */
export function MarkdownEditor({
  value,
  onChange,
  maxLength,
  placeholder,
  mode = 'hashtags',
}: {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  placeholder?: string;
  mode?: RichTextMode;
}): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);

  const restore = (start: number, end: number) => {
    requestAnimationFrame(() => {
      const ta = ref.current;
      if (!ta) return;
      ta.focus();
      ta.selectionStart = start;
      ta.selectionEnd = end;
    });
  };

  const wrap = (before: string, after: string) => {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const selected = value.slice(s, e) || 'texto';
    onChange(value.slice(0, s) + before + selected + after + value.slice(e));
    restore(s + before.length, s + before.length + selected.length);
  };

  /** Prefixa as linhas da seleção (lista, título) — o prefixo vale para a linha inteira. */
  const prefixLines = (prefix: string, fallback: string) => {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    const block = value.slice(lineStart, e) || fallback;
    const replaced = block
      .split('\n')
      .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
      .join('\n');
    onChange(value.slice(0, lineStart) + replaced + value.slice(e));
    restore(lineStart, lineStart + replaced.length);
  };

  return (
    <div className="md-editor">
      <div className="md-toolbar" role="toolbar" aria-label="Formatação">
        <button type="button" className="md-btn" onClick={() => wrap('**', '**')} title="Negrito">
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="md-btn md-btn-i"
          onClick={() => wrap('*', '*')}
          title="Itálico"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className="md-btn"
          onClick={() => prefixLines('- ', 'item')}
          title="Lista"
        >
          ☰
        </button>
        {mode === 'headings' ? (
          <button
            type="button"
            className="md-btn"
            onClick={() => prefixLines('## ', 'título')}
            title="Título"
          >
            <strong>H</strong>
          </button>
        ) : (
          <button type="button" className="md-btn" onClick={() => wrap('#', '')} title="Hashtag">
            #
          </button>
        )}
      </div>
      <textarea
        ref={ref}
        className="field-textarea md-textarea"
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

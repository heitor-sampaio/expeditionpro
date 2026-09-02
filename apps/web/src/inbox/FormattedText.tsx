import { parseWhatsAppText, type Block, type Inline } from './whatsappText.js';

/**
 * AT-07 — o texto da conversa, com a formatação que quem escreveu enxergou no aparelho.
 *
 * Monta elementos a partir da árvore do parser. Em nenhum ponto o texto de terceiro vira
 * marcação: não há `dangerouslySetInnerHTML` aqui, e não pode passar a haver — a conversa é o
 * lugar mais óbvio para alguém colar uma tag e ver o que acontece.
 */
export function FormattedText({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="inbox-msg-body">
      {parseWhatsAppText(text).map((bloco, i) => (
        <Bloco key={i} bloco={bloco} />
      ))}
    </div>
  );
}

function Bloco({ bloco }: { bloco: Block }): React.JSX.Element {
  if (bloco.kind === 'pre') return <pre className="inbox-pre">{bloco.text}</pre>;
  if (bloco.kind === 'quote') {
    return (
      <blockquote className="inbox-quote">
        <Linha children={bloco.children} />
      </blockquote>
    );
  }
  if (bloco.kind === 'bullet') {
    return (
      <ul className="inbox-list">
        {bloco.items.map((item, i) => (
          <li key={i}>
            <Linha children={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (bloco.kind === 'ordered') {
    return (
      <ol className="inbox-list" start={bloco.start}>
        {bloco.items.map((item, i) => (
          <li key={i}>
            <Linha children={item} />
          </li>
        ))}
      </ol>
    );
  }
  return (
    <p>
      <Linha children={bloco.children} />
    </p>
  );
}

function Linha({ children }: { children: readonly Inline[] }): React.JSX.Element {
  return (
    <>
      {children.map((parte, i) => (
        <Pedaco key={i} parte={parte} />
      ))}
    </>
  );
}

function Pedaco({ parte }: { parte: Inline }): React.JSX.Element {
  if (parte.kind === 'text') return <>{parte.text}</>;
  if (parte.kind === 'bold')
    return (
      <strong>
        <Linha children={parte.children} />
      </strong>
    );
  if (parte.kind === 'italic')
    return (
      <em>
        <Linha children={parte.children} />
      </em>
    );
  if (parte.kind === 'strike')
    return (
      <s>
        <Linha children={parte.children} />
      </s>
    );
  return (
    <code className="inbox-code">
      <Linha children={parte.children} />
    </code>
  );
}

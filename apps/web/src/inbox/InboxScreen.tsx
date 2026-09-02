import { useEffect, useMemo, useRef, useState } from 'react';
import { whatsappLink } from '../ui/whatsapp.js';
import { useBoard } from '../crm/useBoard.js';
import { useItineraries } from '../agenda/useItineraries.js';
import { ContactPanel } from './ContactPanel.js';
import { channelLabel, contactTitle, iniciais, type Channel } from './inboxFormat.js';
import { matchesSearch } from './searchConversations.js';
import { useInbox, type Conversation, type Message } from './useInbox.js';

/**
 * §5.17 — a caixa de conversas, omnichannel.
 *
 * Três colunas, no formato que quem atende já conhece de qualquer cliente de mensagem: a lista
 * à esquerda, o fio no meio, e quem é a pessoa à direita. A terceira coluna é o que este
 * sistema tem a mais — ela mostra o cartão do funil, então dá para responder sabendo em que pé
 * está a negociação, sem trocar de tela.
 *
 * Caixa **compartilhada**: toda a equipe vê e responde qualquer conversa (AT-07). Não há
 * conversa "de alguém" — conversa parada porque o dono dela está na estrada é problema pior
 * que conversa sem dono.
 *
 * A página ocupa a altura da janela e **cada coluna rola sozinha**, como um cliente de
 * mensagem. Até 1180px a coluna da direita vira um painel que abre pelo botão "Detalhes";
 * até 860px sobra uma coluna só, e abrir a conversa esconde a lista.
 *
 * Nenhuma cor carrega estado aqui. O não lido e a linha selecionada usam o accent do tenant
 * porque são estado de **interface**, como a nav ativa e o chip de filtro — nunca porque
 * signifiquem dinheiro.
 */

const CANAIS: readonly { id: Channel | 'todos'; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'messenger', label: 'Messenger' },
];

export function InboxScreen(): React.JSX.Element {
  const {
    list,
    thread,
    openId,
    abrir,
    fechar,
    enviar,
    marcarLida,
    anexar,
    criarEAnexar,
    recarregar,
  } = useInbox();
  const [canal, setCanal] = useState<Channel | 'todos'>('todos');
  const [busca, setBusca] = useState('');
  const [detalhes, setDetalhes] = useState(false);

  // AT-10: o funil já vem pela API do CRM, e o painel da direita lê dela. Uma requisição para
  // a tela inteira, não uma por conversa aberta.
  const board = useBoard();
  const colunas = board.state.status === 'ready' ? board.state.columns : [];
  const roteiros = useItineraries(true);
  const listaRoteiros = roteiros.status === 'ready' ? roteiros.itineraries : [];

  const conversas = list.status === 'ready' ? list.conversations : [];
  const filtradas = useMemo(
    () =>
      conversas
        .filter((c) => canal === 'todos' || c.channel === canal)
        .filter((c) => matchesSearch(c, busca)),
    [conversas, canal, busca],
  );
  const naoLidas = conversas.reduce((total, c) => total + (c.unreadCount > 0 ? 1 : 0), 0);

  return (
    <main className="page page-wide page-chat">
      <div className="page-header">
        <div className="toolbar">
          <div>
            <h1 className="page-title">Conversas</h1>
            <p className="page-meta">
              {naoLidas === 0
                ? 'Tudo lido. A caixa é da equipe inteira.'
                : `${naoLidas} conversa${naoLidas > 1 ? 's' : ''} sem resposta.`}
            </p>
          </div>
          <div className="sort-group" role="group" aria-label="Filtrar por canal">
            {CANAIS.map((opcao) => (
              <button
                key={opcao.id}
                type="button"
                className={`chip${canal === opcao.id ? ' is-active' : ''}`}
                aria-pressed={canal === opcao.id}
                onClick={() => setCanal(opcao.id)}
              >
                {opcao.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {list.status === 'loading' && (
        <div className="skeleton">
          <div className="skel-card">
            <div className="skel-avatar" />
            <div className="skel-bars">
              <div className="skel-bar" />
              <div className="skel-bar short" />
            </div>
          </div>
          <div className="skel-card">
            <div className="skel-avatar" />
            <div className="skel-bars">
              <div className="skel-bar" />
              <div className="skel-bar short" />
            </div>
          </div>
        </div>
      )}

      {list.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar as conversas</span>
            <span className="state-line is-error">Tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={recarregar}>
            Tentar de novo
          </button>
        </div>
      )}

      {list.status === 'forbidden' && (
        <div className="state">
          <div className="state-text">
            <span className="state-title">Sem acesso às conversas</span>
            <span className="state-line">
              O atendimento é da equipe. Peça acesso a um owner ou admin.
            </span>
          </div>
          <div className="state-grow" />
        </div>
      )}

      {list.status === 'ready' && conversas.length === 0 && (
        <div className="state">
          <div className="state-text">
            <span className="state-title">Nenhuma conversa ainda</span>
            <span className="state-line">
              Conecte o WhatsApp em Configurações → Integrações. A partir daí, toda mensagem que
              chegar aparece aqui.
            </span>
          </div>
          <div className="state-grow" />
        </div>
      )}

      {list.status === 'ready' && conversas.length > 0 && (
        <div
          className={`inbox${openId === null ? '' : ' is-open'}${detalhes ? ' is-details' : ''}`}
        >
          <div className="inbox-list">
            {/* Fica preso no topo: a lista rola por baixo dele, como em qualquer caixa. */}
            <div className="inbox-search">
              <input
                className="field-input"
                type="search"
                value={busca}
                aria-label="Buscar conversa por nome ou telefone"
                placeholder="Buscar por nome ou telefone"
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            {filtradas.length === 0 ? (
              <p className="members-empty">{semResultado(busca, canal)}</p>
            ) : (
              filtradas.map((conversa) => (
                <ConversationRow
                  key={conversa.id}
                  conversation={conversa}
                  ativa={conversa.id === openId}
                  onOpen={() => {
                    abrir(conversa.id);
                    setDetalhes(false);
                    if (conversa.unreadCount > 0) void marcarLida(conversa.id);
                  }}
                />
              ))
            )}
          </div>

          <div className="inbox-thread">
            {thread.status === 'idle' && (
              <p className="members-empty">Escolha uma conversa para ler o fio.</p>
            )}
            {thread.status === 'loading' && (
              <div className="skeleton">
                <div className="skel-card" />
                <div className="skel-card" />
              </div>
            )}
            {thread.status === 'error' && (
              <p className="members-empty">Não deu para abrir esta conversa.</p>
            )}
            {thread.status === 'ready' && (
              <Thread
                conversation={thread.conversation}
                messages={thread.messages}
                onVoltar={fechar}
                onDetalhes={() => setDetalhes((atual) => !atual)}
                onEnviar={enviar}
              />
            )}
          </div>

          <aside className="inbox-side">
            {thread.status === 'ready' ? (
              <ContactPanel
                conversation={thread.conversation}
                columns={colunas}
                itineraries={listaRoteiros}
                totalMensagens={thread.messages.length}
                onAnexar={anexar}
                onCriar={criarEAnexar}
              />
            ) : (
              <p className="members-empty">Abra uma conversa para ver o contato.</p>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

/**
 * O estado de "filtro sem resultado" diz **qual** filtro não achou: com dois em cima da mesma
 * lista, "nenhuma conversa" deixa quem procura sem saber o que afrouxar.
 */
function semResultado(busca: string, canal: Channel | 'todos'): string {
  if (busca.trim() !== '') return `Nenhuma conversa para "${busca.trim()}".`;
  return canal === 'todos' ? 'Nenhuma conversa.' : 'Nenhuma conversa neste canal.';
}

function ConversationRow({
  conversation,
  ativa,
  onOpen,
}: {
  conversation: Conversation;
  ativa: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  const titulo = contactTitle(conversation);
  return (
    <button
      type="button"
      className={`inbox-row${ativa ? ' is-active' : ''}`}
      onClick={onOpen}
      aria-current={ativa}
    >
      <span className="avatar">{iniciais(titulo)}</span>
      <span className="inbox-row-text">
        <span className="member-name">{titulo}</span>
        <span className="member-cpf">{channelLabel(conversation.channel)}</span>
      </span>
      <span className="inbox-row-meta">
        <span className="inbox-time">{quando(conversation.lastMessageAt)}</span>
        {conversation.unreadCount > 0 && (
          <span className="inbox-unread">{conversation.unreadCount}</span>
        )}
      </span>
    </button>
  );
}

function Thread({
  conversation,
  messages,
  onVoltar,
  onDetalhes,
  onEnviar,
}: {
  conversation: Conversation;
  messages: Message[];
  onVoltar: () => void;
  onDetalhes: () => void;
  onEnviar: (id: string, texto: string) => Promise<{ ok: true } | { ok: false; message: string }>;
}): React.JSX.Element {
  const titulo = contactTitle(conversation);
  const fim = useRef<HTMLDivElement>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async () => {
    const conteudo = texto.trim();
    if (conteudo === '' || enviando) return;
    setEnviando(true);
    setErro(null);
    const resultado = await onEnviar(conversation.id, conteudo);
    setEnviando(false);
    // Só limpa o campo quando saiu de verdade: apagar o que a pessoa escreveu depois de uma
    // recusa a obrigaria a digitar de novo, e a recusa costuma ser do provedor, não do texto.
    if (resultado.ok) setTexto('');
    else setErro(resultado.message);
  };

  // Fio de conversa se lê pelo fim: é lá que está a mensagem que ainda não foi respondida.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [conversation.id, messages.length]);

  return (
    <>
      <div className="inbox-head">
        <button type="button" className="btn btn-secondary btn-sm inbox-back" onClick={onVoltar}>
          Voltar
        </button>
        <span className="avatar">{iniciais(titulo)}</span>
        <div className="inbox-head-text">
          <span className="card-title">{titulo}</span>
          <span className="member-cpf">
            {channelLabel(conversation.channel)}
            {conversation.customerId ? ' · cliente cadastrado' : ' · contato solto'}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm inbox-details"
          onClick={onDetalhes}
        >
          Detalhes
        </button>
        {/* Sem número não há link: `wa.me` com um LID abre uma conversa com ninguém. */}
        {conversation.channel === 'whatsapp' && conversation.phone !== null && (
          <a
            className="btn btn-secondary btn-sm"
            href={whatsappLink(conversation.phone, '')}
            target="_blank"
            rel="noreferrer"
          >
            Abrir no WhatsApp
          </a>
        )}
      </div>

      <div className="inbox-msgs">
        {messages.length === 0 ? (
          <p className="members-empty">Esta conversa ainda não tem mensagem.</p>
        ) : (
          messages.map((mensagem) => (
            <div
              key={mensagem.id}
              className={`inbox-msg${mensagem.direction === 'out' ? ' is-out' : ''}`}
            >
              <p className="inbox-msg-body">{mensagem.body}</p>
              <span className="inbox-msg-time">{hora(mensagem.sentAt)}</span>
            </div>
          ))
        )}
        <div ref={fim} />
      </div>

      {erro && (
        <div className="feedback feedback-error inbox-foot" role="alert">
          <span className="feedback-dot" />
          <span>{erro}</span>
        </div>
      )}

      <div className="inline-form inbox-foot">
        <input
          className="field-input"
          value={texto}
          maxLength={4000}
          disabled={enviando}
          aria-label="Escreva a resposta"
          placeholder="Escreva a resposta"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void enviar();
          }}
        />
        <button
          type="button"
          className="inline-send"
          aria-label="Enviar resposta"
          disabled={enviando || texto.trim() === ''}
          onClick={() => void enviar()}
        >
          <SendIcon />
        </button>
      </div>
    </>
  );
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function quando(iso: string | null): string {
  if (iso === null) return '';
  const data = new Date(iso);
  const hoje = new Date();
  const mesmoDia = data.toDateString() === hoje.toDateString();
  return mesmoDia
    ? data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** Ícone do botão de enviar. Cópia local, como na comunidade: a terceira é que vira comum. */
function SendIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4 12 16-8-6 8 6 8z" />
    </svg>
  );
}

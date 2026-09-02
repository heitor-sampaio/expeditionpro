import { useMemo, useState } from 'react';
import { whatsappLink } from '../ui/whatsapp.js';
import { useBoard } from '../crm/useBoard.js';
import { channelLabel, contactTitle, iniciais, type Channel } from './inboxFormat.js';
import { useInbox, type Conversation, type Message } from './useInbox.js';

/**
 * §5.17 — a caixa de conversas, omnichannel.
 *
 * Caixa **compartilhada**: toda a equipe vê e responde qualquer conversa (AT-07). Não há
 * conversa "de alguém" — numa operação deste tamanho, conversa parada porque o dono dela está
 * na estrada é problema pior que conversa sem dono.
 *
 * Layout de duas colunas: lista à esquerda, fio à direita. Abaixo de 860px vira uma coluna só
 * — abrir uma conversa esconde a lista, que é como todo aplicativo de mensagem se comporta no
 * telefone.
 *
 * Nenhuma cor carrega estado aqui. O não lido usa o accent do tenant porque é **estado de
 * interface** (como a nav ativa e o chip de filtro), não estado financeiro.
 */

const CANAIS: readonly { id: Channel | 'todos'; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'messenger', label: 'Messenger' },
];

export function InboxScreen(): React.JSX.Element {
  const { list, thread, openId, abrir, fechar, marcarLida, anexar, criarEAnexar, recarregar } =
    useInbox();
  const [canal, setCanal] = useState<Channel | 'todos'>('todos');

  const conversas = list.status === 'ready' ? list.conversations : [];
  const filtradas = useMemo(
    () => (canal === 'todos' ? conversas : conversas.filter((c) => c.channel === canal)),
    [conversas, canal],
  );
  const naoLidas = conversas.reduce((total, c) => total + (c.unreadCount > 0 ? 1 : 0), 0);

  return (
    <main className="page page-wide">
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
          <button type="button" className="btn btn-secondary btn-sm" onClick={recarregar}>
            Atualizar
          </button>
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
        <div className={`inbox${openId === null ? '' : ' is-open'}`}>
          <div className="inbox-list">
            {filtradas.length === 0 ? (
              <p className="members-empty">Nenhuma conversa neste canal.</p>
            ) : (
              filtradas.map((conversa) => (
                <ConversationRow
                  key={conversa.id}
                  conversation={conversa}
                  ativa={conversa.id === openId}
                  onOpen={() => {
                    abrir(conversa.id);
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
                onAnexar={anexar}
                onCriar={criarEAnexar}
                onVoltar={fechar}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
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
  onAnexar,
  onCriar,
  onVoltar,
}: {
  conversation: Conversation;
  messages: Message[];
  onAnexar: (id: string, opportunityId: string | null) => Promise<boolean>;
  onCriar: (dados: {
    conversationId: string;
    contactName: string;
    phone?: string;
    source: Channel;
  }) => Promise<boolean>;
  onVoltar: () => void;
}): React.JSX.Element {
  // AT-10: a ponte com o funil. O quadro já é carregado pela mesma API do CRM — a caixa não
  // ganha uma lista própria de oportunidades só para preencher um seletor.
  const { state } = useBoard();
  const oportunidades =
    state.status === 'ready' ? state.columns.flatMap((coluna) => coluna.opportunities) : [];
  const titulo = contactTitle(conversation);

  return (
    <>
      <div className="inbox-head">
        <button type="button" className="btn btn-secondary btn-sm inbox-back" onClick={onVoltar}>
          Voltar
        </button>
        <div className="inbox-head-text">
          <span className="card-title">{titulo}</span>
          <span className="member-cpf">
            {channelLabel(conversation.channel)}
            {conversation.customerId ? ' · cliente cadastrado' : ' · contato solto'}
          </span>
        </div>
        {conversation.channel === 'whatsapp' && (
          <a
            className="btn btn-secondary btn-sm"
            href={whatsappLink(conversation.channelUserId, '')}
            target="_blank"
            rel="noreferrer"
          >
            Responder no WhatsApp
          </a>
        )}
      </div>

      <label className="field inbox-attach">
        <span className="field-label">Oportunidade no funil</span>
        <select
          className="field-input"
          value={conversation.opportunityId ?? ''}
          onChange={(e) => void onAnexar(conversation.id, e.target.value || null)}
        >
          <option value="">Nenhuma</option>
          {oportunidades.map((o) => (
            <option key={o.id} value={o.id}>
              {o.contactName}
            </option>
          ))}
        </select>
        <span className="field-help">
          Ligar a conversa ao cartão é o que faz o funil deixar de ser digitação.
        </span>
      </label>

      {conversation.opportunityId === null && (
        <button
          type="button"
          className="btn btn-secondary btn-sm inbox-new-opp"
          onClick={() =>
            void onCriar({
              conversationId: conversation.id,
              contactName: titulo,
              ...(conversation.channel === 'whatsapp' ? { phone: conversation.channelUserId } : {}),
              source: conversation.channel,
            })
          }
        >
          Criar oportunidade com este contato
        </button>
      )}

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
      </div>

      <div className="feedback feedback-info" role="status">
        <span className="feedback-dot" />
        <span>Responder por aqui entra na próxima etapa. Por enquanto, use o botão acima.</span>
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

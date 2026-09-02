import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import { useLiveRefresh } from '../live/useLiveRefresh.js';
import type { Channel } from './inboxFormat.js';

/**
 * §5.17 — a caixa de conversas.
 *
 * Zero regra aqui: quem pode ler, quem pode marcar como lida e a quem a conversa pode ser
 * anexada são do servidor, e é lá que estão testados. Este hook carrega, chama e traduz erro
 * para português — o mesmo desenho de `useBoard` e `useTeamMembers`.
 */

export interface Conversation {
  id: string;
  channel: Channel;
  /** AT-05: a identidade no canal — LID quando existe. Não serve para discar nem para ler. */
  channelUserId: string;
  /** O número, quando conhecido. É o que a tela mostra e o que abre o WhatsApp. */
  phone: string | null;
  displayName: string | null;
  customerId: string | null;
  opportunityId: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface Message {
  id: string;
  direction: 'in' | 'out';
  body: string;
  sentByUserId: string | null;
  sentAt: string;
}

export type ListState =
  | { status: 'loading' }
  | { status: 'ready'; conversations: Conversation[] }
  | { status: 'error' }
  | { status: 'forbidden' };

export type ThreadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; conversation: Conversation; messages: Message[] }
  | { status: 'error' };

export function useInbox() {
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [thread, setThread] = useState<ThreadState>({ status: 'idle' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [listKey, setListKey] = useState(0);
  const [threadKey, setThreadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api('/v1/inbox/conversations', { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          setList({ status: 'forbidden' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        setList({ status: 'ready', conversations: (await res.json()) as Conversation[] });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setList({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [listKey]);

  useEffect(() => {
    if (openId === null) {
      setThread({ status: 'idle' });
      return;
    }
    setThread({ status: 'loading' });
    const controller = new AbortController();
    api(`/v1/inbox/conversations/${encodeURIComponent(openId)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const corpo = (await res.json()) as { conversation: Conversation; messages: Message[] };
        setThread({ status: 'ready', ...corpo });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setThread({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [openId, threadKey]);

  const recarregar = useCallback(() => {
    setListKey((k) => k + 1);
    setThreadKey((k) => k + 1);
  }, []);

  /*
   * AT-09 — a caixa atualiza sozinha. Mensagem que chega enquanto alguém lê a conversa é o
   * caso comum aqui, não a exceção: do outro lado tem gente digitando. As duas tabelas entram
   * porque `conversations` carrega o não lido e a ordem, e `messages` carrega o fio.
   */
  useLiveRefresh(
    'inbox',
    [{ table: 'conversations' }, { table: 'messages' }],
    useCallback(() => recarregar(), [recarregar]),
  );

  /**
   * AT-08 — responder. Devolve o motivo do provedor quando ele recusa: "o número não existe
   * no WhatsApp" e "não foi possível enviar" levam a lugares diferentes.
   */
  const enviar = useCallback(
    async (id: string, texto: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      const res = await api(`/v1/inbox/conversations/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: texto }),
      });
      if (res.ok) {
        recarregar();
        return { ok: true };
      }
      const corpo = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      return { ok: false, message: falhaAoEnviar(corpo, res.status) };
    },
    [recarregar],
  );

  const abrir = useCallback((id: string) => setOpenId(id), []);
  /** Volta para a lista. No telefone é a única saída: com conversa aberta, a lista some. */
  const fechar = useCallback(() => setOpenId(null), []);

  const marcarLida = useCallback(async (id: string): Promise<boolean> => {
    const res = await api(`/v1/inbox/conversations/${encodeURIComponent(id)}/read`, {
      method: 'POST',
    });
    if (!res.ok) return false;
    // Zera na lista sem esperar o recarregamento: é o retorno visual do clique.
    setList((atual) =>
      atual.status === 'ready'
        ? {
            ...atual,
            conversations: atual.conversations.map((c) =>
              c.id === id ? { ...c, unreadCount: 0 } : c,
            ),
          }
        : atual,
    );
    return true;
  }, []);

  const anexar = useCallback(
    async (id: string, opportunityId: string | null): Promise<boolean> => {
      const res = await api(`/v1/inbox/conversations/${encodeURIComponent(id)}/opportunity`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ opportunityId }),
      });
      if (res.ok) recarregar();
      return res.ok;
    },
    [recarregar],
  );

  /**
   * AT-10 — abre um cartão já com o nome e o telefone que o canal trouxe, e amarra a conversa
   * nele. É o caminho que o requisito pede: quem chegou pelo WhatsApp vira oportunidade sem
   * ninguém redigitar o que já está na tela.
   */
  const criarEAnexar = useCallback(
    async (dados: {
      conversationId: string;
      contactName: string;
      phone?: string;
      source: Channel;
    }): Promise<boolean> => {
      const res = await api('/v1/crm/opportunities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contactName: dados.contactName,
          ...(dados.phone ? { phone: dados.phone } : {}),
          source: dados.source,
        }),
      });
      if (!res.ok) return false;
      const criada = (await res.json()) as { id: string };
      return anexar(dados.conversationId, criada.id);
    },
    [anexar],
  );

  return {
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
  };
}

/** O código do servidor vira frase; o motivo do provedor passa direto, que é o que ajuda. */
function falhaAoEnviar(corpo: { error?: string; detail?: string }, status: number): string {
  if (corpo.error === 'send_failed' && corpo.detail) return `O WhatsApp recusou: ${corpo.detail}`;
  if (corpo.error === 'channel_not_connected')
    return 'O canal desta conversa não está conectado. Reconecte em Configurações → Integrações.';
  if (corpo.error === 'required_field') return 'Escreva a mensagem antes de enviar.';
  if (status === 401 || status === 403) return 'Seu perfil não permite responder.';
  return 'Não foi possível enviar.';
}

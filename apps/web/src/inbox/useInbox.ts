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
  channelUserId: string;
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

  return { list, thread, openId, abrir, fechar, marcarLida, anexar, criarEAnexar, recarregar };
}

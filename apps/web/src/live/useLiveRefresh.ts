import { useEffect, useRef } from 'react';
import { supabase } from '../auth/supabaseClient.js';

/**
 * Recarrega uma tela quando as tabelas que ela mostra mudam no banco (Supabase Realtime).
 *
 * Duas decisões que valem para todas as telas ao vivo:
 * - **Coalesce**: uma rajada (inscrição + participantes + recebimento numa transação) vira
 *   um recarregamento só, depois de 500ms parados. Sem isso a mesa piscaria três vezes.
 * - **Recarrega, não aplica o payload**: o evento diz *que* mudou, e a tela relê do servidor.
 *   Montar o novo estado a partir do payload duplicaria as regras de derivação (recebido,
 *   ocupação, totais) no front — e elas moram no caso de uso.
 *
 * O Realtime respeita a RLS: cada audiência recebe só as linhas que já podia ler. A equipe
 * vê o tenant; o cliente, a própria família.
 */
export function useLiveRefresh(
  channelName: string,
  tables: readonly { readonly table: string; readonly filter?: string | undefined }[],
  onChange: () => void,
): void {
  // A callback costuma ser inline no chamador; guardá-la em ref evita reassinar o canal
  // a cada render.
  const latest = useRef(onChange);
  latest.current = onChange;

  const key = tables.map((t) => `${t.table}:${t.filter ?? ''}`).join('|');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => latest.current(), 500);
    };

    let channel = supabase.channel(channelName);
    for (const entry of key.split('|')) {
      const [table, filter] = entry.split(':');
      if (!table) continue;
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        bump,
      );
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [channelName, key]);
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import { useLiveRefresh } from '../live/useLiveRefresh.js';

/**
 * Navegação do portal (§5.8): saídas abertas, a família do cliente e a auto-inscrição.
 * Só leitura + a chamada de inscrever; toda a regra (elegibilidade, cashback, escopo de
 * família) é do servidor.
 */

export interface Expedition {
  groupId: string;
  itineraryId: string;
  itineraryName: string;
  startDate: string;
  endDate: string;
  confirmedCount: number;
  vacancies: number | null;
}

export interface FamilyMember {
  id: string;
  fullName: string;
  birthDate: string;
  email: string | null;
  phone: string | null;
  role: 'responsible' | 'companion';
}

export type ExpeditionsState =
  { status: 'loading' } | { status: 'ready'; expeditions: Expedition[] } | { status: 'error' };

export function usePortalExpeditions() {
  const [state, setState] = useState<ExpeditionsState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api('/v1/portal/expeditions', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<Expedition[]>;
      })
      .then((expeditions) => setState({ status: 'ready', expeditions }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // Ao vivo: grupo aberto, cancelado ou com datas mudadas aparece sem recarregar. As
  // **inscrições dos outros** o cliente não lê (RLS), então a contagem de vagas só muda
  // quando ele mesmo se inscreve ou quando o grupo muda de estado.
  useLiveRefresh('portal-vitrine', [{ table: 'groups' }, { table: 'schedule_events' }], refresh);

  return { state, refresh };
}

export function usePortalFamily() {
  const [family, setFamily] = useState<FamilyMember[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api('/v1/portal/family', { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<FamilyMember[]>) : []))
      .then(setFamily)
      .catch(() => setFamily([]));
    return () => controller.abort();
  }, []);

  return family;
}

export type EnrollResult = { ok: true } | { ok: false; message: string };

export function usePortalEnroll() {
  const [busy, setBusy] = useState(false);

  const enroll = useCallback(
    async (groupId: string, participantCustomerIds: string[]): Promise<EnrollResult> => {
      setBusy(true);
      try {
        const res = await api(`/v1/portal/groups/${groupId}/enroll`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ participantCustomerIds }),
        });
        if (res.ok) return { ok: true };
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, message: messageFor(body.error, res.status) };
      } catch {
        return { ok: false, message: 'Falha de conexão.' };
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { enroll, busy };
}

function messageFor(code: string | undefined, status: number): string {
  if (code === 'already_allocated') return 'Você já tem uma inscrição nessa saída.';
  if (code === 'group_not_open') return 'Essa saída não está mais aberta para inscrição.';
  if (code === 'no_price_for_group_date') return 'Essa saída ainda não tem preço definido.';
  if (status === 403) return 'Você só inscreve a sua própria família.';
  return 'Não foi possível concluir a inscrição. Tente de novo.';
}

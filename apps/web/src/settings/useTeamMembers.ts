import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * SEC-17 — quem tem acesso ao sistema, e tirar o acesso de alguém.
 *
 * O papel mostrado aqui é o do banco, que é o mesmo que o servidor consulta a cada
 * requisição: tirar o acesso vale na requisição seguinte, não quando o token expirar.
 */

export type MemberRole = 'owner' | 'admin' | 'operator' | 'viewer';

export interface TeamMember {
  userId: string;
  email: string | null;
  role: MemberRole;
  /** ISO curta (yyyy-mm-dd), formatada na tela. */
  since: string;
}

export type MembersState =
  | { status: 'loading' }
  | { status: 'ready'; members: TeamMember[] }
  | { status: 'error' }
  | { status: 'forbidden' };

export type RevokeResult = { ok: true } | { ok: false; message: string };

export function useTeamMembers() {
  const [state, setState] = useState<MembersState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api('/v1/team/members', { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          setState({ status: 'forbidden' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: 'ready', members: (await res.json()) as TeamMember[] });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const revoke = useCallback(
    async (userId: string): Promise<RevokeResult> => {
      setBusy(true);
      try {
        const res = await api(`/v1/team/members/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
        });
        if (!res.ok) return { ok: false, message: messageFor(res.status) };
        refresh();
        return { ok: true };
      } catch {
        return { ok: false, message: 'Falha de conexão.' };
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const changeRole = useCallback(
    async (userId: string, role: MemberRole): Promise<RevokeResult> => {
      setBusy(true);
      try {
        const res = await api(`/v1/team/members/${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ role }),
        });
        if (!res.ok) return { ok: false, message: mensagemDoPapel(res.status) };
        refresh();
        return { ok: true };
      } catch {
        return { ok: false, message: 'Falha de conexão.' };
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return { state, revoke, changeRole, refresh, busy };
}

function messageFor(status: number): string {
  if (status === 401 || status === 403) return 'Seu perfil não permite tirar acesso (owner/admin).';
  if (status === 404) return 'Esta pessoa já não tem acesso.';
  // 400 aqui só vem de `cannot_revoke_self`: é a única regra de negócio desta rota.
  if (status === 400) return 'Não é possível tirar o próprio acesso.';
  return 'Não foi possível tirar o acesso.';
}

function mensagemDoPapel(status: number): string {
  if (status === 401 || status === 403)
    return 'Somente o owner muda o papel de um owner, ou promove alguém a owner.';
  if (status === 404) return 'Esta pessoa já não tem acesso.';
  // 400 vem de `cannot_change_own_role` ou de papel fora da lista aceita.
  if (status === 400) return 'Não é possível trocar o próprio papel.';
  return 'Não foi possível trocar o papel.';
}

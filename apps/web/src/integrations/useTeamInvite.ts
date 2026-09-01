import { useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Convite de membro de equipe (§3.7). Envia e-mail + papel; o servidor cria o usuário
 * no Supabase Auth com `app_metadata.{tenant_id, role}` (o tenant vem do JWT, nunca daqui).
 * Devolve o link de acesso quando disponível, para entrega manual sem SMTP.
 */

export type InviteRole = 'admin' | 'operator' | 'viewer';

export type InviteResult = { ok: true; actionLink: string | null } | { ok: false; message: string };

export function useTeamInvite() {
  const [busy, setBusy] = useState(false);

  const invite = async (email: string, role: InviteRole): Promise<InviteResult> => {
    setBusy(true);
    try {
      const res = await api('/v1/team/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) return { ok: false, message: messageFor(res.status) };
      const body = (await res.json()) as { actionLink: string | null };
      return { ok: true, actionLink: body.actionLink };
    } catch {
      return { ok: false, message: 'Falha de conexão.' };
    } finally {
      setBusy(false);
    }
  };

  return { invite, busy };
}

function messageFor(status: number): string {
  if (status === 503) return 'Convite indisponível: o servidor não tem a Admin API configurada.';
  if (status === 401 || status === 403) return 'Seu perfil não permite convidar (owner/admin).';
  if (status === 409 || status === 422) return 'Este e-mail já tem conta no sistema.';
  if (status === 400) return 'Confira o e-mail e o papel.';
  return 'Não foi possível enviar o convite.';
}

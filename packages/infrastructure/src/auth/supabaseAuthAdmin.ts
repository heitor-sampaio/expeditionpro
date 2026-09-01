import { BusinessRuleError } from '@expedition/application';
import type {
  AuthAdminGateway,
  InvitedUser,
  PortalInvite,
  TeamInvite,
} from '@expedition/application';

/**
 * Implementação do port de admin de identidade via **Admin API** do Supabase (GoTrue).
 * Usa a `service_role` key — segredo, só no servidor. Cria o usuário com
 * `app_metadata.{tenant_id, role}` (o que a RLS lê) e gera o magic link de acesso.
 * Chamada REST direta (fetch): não puxa o supabase-js para o servidor, que já fala JWT
 * por `jose`. O `service_role` nunca aparece em log nem em resposta.
 */

export interface SupabaseAuthAdminConfig {
  readonly url: string;
  readonly serviceRoleKey: string;
}

interface CreatedUser {
  readonly id: string;
}

export function supabaseAuthAdmin(config: SupabaseAuthAdminConfig): AuthAdminGateway {
  const base = config.url.replace(/\/+$/, '');
  const headers = {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
    'content-type': 'application/json',
  };

  // Cria o usuário com o app_metadata dado (a Admin API não dispara e-mail aqui) e gera
  // o magic link de acesso. É o caminho comum de equipe e cliente — só o metadata muda.
  async function createAndLink(
    email: string,
    appMetadata: Record<string, string>,
  ): Promise<InvitedUser> {
    const created = await fetch(`${base}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, email_confirm: false, app_metadata: appMetadata }),
    });
    if (created.status === 409 || created.status === 422) {
      throw new BusinessRuleError('email_already_registered', 'E-mail já tem conta neste sistema');
    }
    if (!created.ok) {
      throw new Error(`Supabase admin/users respondeu ${created.status}`);
    }
    const user = (await created.json()) as CreatedUser;

    const link = await fetch(`${base}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: 'magiclink', email }),
    });
    const actionLink = link.ok
      ? (((await link.json()) as { action_link?: string }).action_link ?? null)
      : null;

    return { userId: user.id, actionLink };
  }

  return {
    inviteTeamMember(invite: TeamInvite): Promise<InvitedUser> {
      return createAndLink(invite.email, { tenant_id: invite.tenantId, role: invite.role });
    },
    invitePortalCustomer(invite: PortalInvite): Promise<InvitedUser> {
      return createAndLink(invite.email, {
        tenant_id: invite.tenantId,
        role: 'customer',
        customer_id: invite.customerId,
      });
    },
  };
}

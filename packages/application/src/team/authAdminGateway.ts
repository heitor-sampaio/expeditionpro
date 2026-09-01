/**
 * Port da administração de identidade (§3.7). Criar um usuário de equipe e emitir o
 * convite é operação privilegiada — usa a service_role key do Supabase, que é segredo
 * e vive **só no servidor**. A aplicação fala com este port; a infraestrutura o
 * implementa via Admin API. O `tenantId` e o `role` vêm sempre do contexto do inviter,
 * nunca do cliente — colocar `tenant_id` no `app_metadata` é o que a RLS lê (§2.2).
 */

export interface TeamInvite {
  readonly email: string;
  readonly tenantId: string;
  readonly role: string; // já validado como papel de equipe pelo caso de uso
}

export interface InvitedUser {
  readonly userId: string;
  /** Link de acesso (magic link) quando a Admin API o devolve — para entrega manual
   *  quando não há SMTP. Pode ser null. Nunca logar: dá acesso à conta. */
  readonly actionLink: string | null;
}

/** Convite do cliente ao portal (PC-01/PC-02): `role: customer` + `tenant_id` + `customer_id`. */
export interface PortalInvite {
  readonly email: string;
  readonly tenantId: string;
  readonly customerId: string;
}

export interface AuthAdminGateway {
  /** Cria (ou convida) o usuário no Supabase Auth com `app_metadata.{tenant_id, role}`. */
  inviteTeamMember(invite: TeamInvite): Promise<InvitedUser>;
  /** Cria o usuário do cliente com `app_metadata.{tenant_id, role: customer, customer_id}`. */
  invitePortalCustomer(invite: PortalInvite): Promise<InvitedUser>;
}

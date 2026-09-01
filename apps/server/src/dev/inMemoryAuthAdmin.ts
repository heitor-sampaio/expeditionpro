import type {
  AuthAdminGateway,
  InvitedUser,
  PortalInvite,
  TeamInvite,
} from '@expedition/application';

/** Admin de identidade em memória — SÓ para dev e testes de rota. Registra os convites. */
export function inMemoryAuthAdmin(): AuthAdminGateway & {
  invites: TeamInvite[];
  portalInvites: PortalInvite[];
} {
  const invites: TeamInvite[] = [];
  const portalInvites: PortalInvite[] = [];
  let seq = 0;
  return {
    invites,
    portalInvites,
    inviteTeamMember(invite: TeamInvite): Promise<InvitedUser> {
      seq += 1;
      invites.push(invite);
      return Promise.resolve({ userId: `dev-user-${seq}`, actionLink: `https://dev/link/${seq}` });
    },
    invitePortalCustomer(invite: PortalInvite): Promise<InvitedUser> {
      seq += 1;
      portalInvites.push(invite);
      return Promise.resolve({
        userId: `dev-cust-${seq}`,
        actionLink: `https://dev/link/${seq}`,
      });
    },
  };
}

import { BusinessRuleError } from '../errors.js';
import type {
  AuthAdminGateway,
  InvitedUser,
  PortalInvite,
  TeamInvite,
} from './authAdminGateway.js';

/**
 * Fake in-memory do port de admin de identidade. Guarda os convites emitidos para o
 * teste inspecionar (inclusive o `tenantId`/`role`/`customerId` gravados). Fora do build.
 */
export function fakeAuthAdminGateway(seed?: {
  existingEmails?: readonly string[];
}): AuthAdminGateway & {
  invites: TeamInvite[];
  portalInvites: PortalInvite[];
} {
  const invites: TeamInvite[] = [];
  const portalInvites: PortalInvite[] = [];
  const existing = new Set((seed?.existingEmails ?? []).map((e) => e.toLowerCase()));
  let seq = 0;

  return {
    invites,
    portalInvites,
    inviteTeamMember(invite: TeamInvite): Promise<InvitedUser> {
      if (existing.has(invite.email.toLowerCase())) {
        return Promise.reject(
          new BusinessRuleError('email_already_registered', 'E-mail já tem conta neste sistema'),
        );
      }
      seq += 1;
      invites.push(invite);
      return Promise.resolve({ userId: `user-${seq}`, actionLink: `https://link/${seq}` });
    },
    invitePortalCustomer(invite: PortalInvite): Promise<InvitedUser> {
      if (existing.has(invite.email.toLowerCase())) {
        return Promise.reject(
          new BusinessRuleError('email_already_registered', 'E-mail já tem conta neste sistema'),
        );
      }
      seq += 1;
      portalInvites.push(invite);
      return Promise.resolve({ userId: `cust-user-${seq}`, actionLink: `https://link/${seq}` });
    },
  };
}

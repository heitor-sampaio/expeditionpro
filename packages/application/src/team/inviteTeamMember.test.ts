import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeAuthAdminGateway } from './authAdminGateway.fake.js';
import { inviteTeamMember } from './inviteTeamMember.js';
import { fakeMembershipRepository } from './membershipRepository.fake.js';
import { listTeamMembers } from './listTeamMembers.js';
import { BusinessRuleError, ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';

function ctxWith(role: 'owner' | 'admin' | 'operator' | 'viewer'): RequestContext {
  return { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u1', role } };
}

describe('§3.7: convite de membro de equipe (Admin API + app_metadata)', () => {
  it('owner convida operator, gravando tenant_id do contexto e o papel no app_metadata', async () => {
    const authAdmin = fakeAuthAdminGateway();
    const result = await inviteTeamMember(
      { authAdmin, audit: fakeAuditLogRepository(), memberships: fakeMembershipRepository() },
      ctxWith('owner'),
      {
        email: 'novo@drakkar.com',
        role: 'operator',
      },
    );
    expect(result.userId).toBeDefined();
    expect(authAdmin.invites).toHaveLength(1);
    expect(authAdmin.invites[0]!.tenantId).toBe('tenant-a'); // do contexto, não do corpo
    expect(authAdmin.invites[0]!.role).toBe('operator');
    expect(authAdmin.invites[0]!.email).toBe('novo@drakkar.com');
  });

  it('admin também pode convidar', async () => {
    const authAdmin = fakeAuthAdminGateway();
    await inviteTeamMember(
      { authAdmin, audit: fakeAuditLogRepository(), memberships: fakeMembershipRepository() },
      ctxWith('admin'),
      {
        email: 'a@b.com',
        role: 'viewer',
      },
    );
    expect(authAdmin.invites).toHaveLength(1);
  });

  it('operator não pode convidar (só owner/admin)', async () => {
    const authAdmin = fakeAuthAdminGateway();
    await expect(
      inviteTeamMember(
        { authAdmin, audit: fakeAuditLogRepository(), memberships: fakeMembershipRepository() },
        ctxWith('operator'),
        {
          email: 'a@b.com',
          role: 'viewer',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(authAdmin.invites).toHaveLength(0);
  });

  it('contexto de cliente não pode convidar', async () => {
    const authAdmin = fakeAuthAdminGateway();
    const customerCtx: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', customerId: 'c1', userId: 'u1' },
    };
    await expect(
      inviteTeamMember(
        { authAdmin, audit: fakeAuditLogRepository(), memberships: fakeMembershipRepository() },
        customerCtx,
        {
          email: 'a@b.com',
          role: 'viewer',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('não deixa conceder owner por convite (escalonamento)', async () => {
    const authAdmin = fakeAuthAdminGateway();
    await expect(
      inviteTeamMember(
        { authAdmin, audit: fakeAuditLogRepository(), memberships: fakeMembershipRepository() },
        ctxWith('owner'),
        {
          email: 'a@b.com',
          role: 'owner',
        },
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(authAdmin.invites).toHaveLength(0);
  });

  it('não deixa conceder papel de cliente nem papel desconhecido', async () => {
    const authAdmin = fakeAuthAdminGateway();
    await expect(
      inviteTeamMember(
        { authAdmin, audit: fakeAuditLogRepository(), memberships: fakeMembershipRepository() },
        ctxWith('owner'),
        {
          email: 'a@b.com',
          role: 'customer',
        },
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      inviteTeamMember(
        { authAdmin, audit: fakeAuditLogRepository(), memberships: fakeMembershipRepository() },
        ctxWith('owner'),
        {
          email: 'a@b.com',
          role: 'root',
        },
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('e-mail já registrado propaga erro de negócio do gateway', async () => {
    const authAdmin = fakeAuthAdminGateway({ existingEmails: ['ja@existe.com'] });
    await expect(
      inviteTeamMember(
        { authAdmin, audit: fakeAuditLogRepository(), memberships: fakeMembershipRepository() },
        ctxWith('owner'),
        {
          email: 'ja@existe.com',
          role: 'viewer',
        },
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

/**
 * SEC-17 — convidar grava a linha de acesso, que é o que a lista lê e o que a revogação
 * apaga. Sem isso, a lista de quem tem acesso nasceria vazia mesmo com gente entrando: o
 * papel viveria só no `app_metadata` do login, invisível para o sistema.
 */
describe('SEC-17: convidar cria a linha de acesso', () => {
  function deps() {
    return {
      authAdmin: fakeAuthAdminGateway(),
      audit: fakeAuditLogRepository(),
      memberships: fakeMembershipRepository(),
    };
  }
  const owner: RequestContext = {
    tenantId: 'tenant-a',
    actor: { kind: 'team', userId: 'u-chefe', role: 'owner' },
  };

  it('o convidado aparece na lista, com papel e e-mail', async () => {
    const d = deps();

    const convidado = await inviteTeamMember(d, owner, {
      email: 'guia@drk.com',
      role: 'operator',
    });

    const lista = await listTeamMembers(d, owner);
    expect(lista).toEqual([
      expect.objectContaining({
        userId: convidado.userId,
        email: 'guia@drk.com',
        role: 'operator',
      }),
    ]);
  });

  it('e-mail já cadastrado é recusado, e nenhuma linha de acesso sobra pela metade', async () => {
    /*
     * O Supabase recusa criar usuário com e-mail existente (409/422), e o gateway traduz
     * isso em `email_already_registered`. A linha de acesso é gravada **depois** do
     * convite, então a recusa não deixa acesso órfão. Trocar o papel de quem já está na
     * equipe não tem caminho hoje — está anotado no status.md.
     */
    const d = {
      authAdmin: fakeAuthAdminGateway({ existingEmails: ['guia@drk.com'] }),
      audit: fakeAuditLogRepository(),
      memberships: fakeMembershipRepository(),
    };

    await expect(
      inviteTeamMember(d, owner, { email: 'guia@drk.com', role: 'operator' }),
    ).rejects.toMatchObject({ code: 'email_already_registered' });

    expect(await listTeamMembers(d, owner)).toEqual([]);
  });
});

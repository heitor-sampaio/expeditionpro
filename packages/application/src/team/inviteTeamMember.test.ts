import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeAuthAdminGateway } from './authAdminGateway.fake.js';
import { inviteTeamMember } from './inviteTeamMember.js';
import { BusinessRuleError, ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';

function ctxWith(role: 'owner' | 'admin' | 'operator' | 'viewer'): RequestContext {
  return { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u1', role } };
}

describe('§3.7: convite de membro de equipe (Admin API + app_metadata)', () => {
  it('owner convida operator, gravando tenant_id do contexto e o papel no app_metadata', async () => {
    const authAdmin = fakeAuthAdminGateway();
    const result = await inviteTeamMember(
      { authAdmin, audit: fakeAuditLogRepository() },
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
    await inviteTeamMember({ authAdmin, audit: fakeAuditLogRepository() }, ctxWith('admin'), {
      email: 'a@b.com',
      role: 'viewer',
    });
    expect(authAdmin.invites).toHaveLength(1);
  });

  it('operator não pode convidar (só owner/admin)', async () => {
    const authAdmin = fakeAuthAdminGateway();
    await expect(
      inviteTeamMember({ authAdmin, audit: fakeAuditLogRepository() }, ctxWith('operator'), {
        email: 'a@b.com',
        role: 'viewer',
      }),
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
      inviteTeamMember({ authAdmin, audit: fakeAuditLogRepository() }, customerCtx, {
        email: 'a@b.com',
        role: 'viewer',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('não deixa conceder owner por convite (escalonamento)', async () => {
    const authAdmin = fakeAuthAdminGateway();
    await expect(
      inviteTeamMember({ authAdmin, audit: fakeAuditLogRepository() }, ctxWith('owner'), {
        email: 'a@b.com',
        role: 'owner',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(authAdmin.invites).toHaveLength(0);
  });

  it('não deixa conceder papel de cliente nem papel desconhecido', async () => {
    const authAdmin = fakeAuthAdminGateway();
    await expect(
      inviteTeamMember({ authAdmin, audit: fakeAuditLogRepository() }, ctxWith('owner'), {
        email: 'a@b.com',
        role: 'customer',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      inviteTeamMember({ authAdmin, audit: fakeAuditLogRepository() }, ctxWith('owner'), {
        email: 'a@b.com',
        role: 'root',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('e-mail já registrado propaga erro de negócio do gateway', async () => {
    const authAdmin = fakeAuthAdminGateway({ existingEmails: ['ja@existe.com'] });
    await expect(
      inviteTeamMember({ authAdmin, audit: fakeAuditLogRepository() }, ctxWith('owner'), {
        email: 'ja@existe.com',
        role: 'viewer',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

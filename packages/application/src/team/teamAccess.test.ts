import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeMembershipRepository } from './membershipRepository.fake.js';
import { listTeamMembers } from './listTeamMembers.js';
import { revokeTeamAccess } from './revokeTeamAccess.js';
import { ForbiddenError, NotFoundError, BusinessRuleError } from '../errors.js';
import type { RequestContext } from '../context.js';

function ctxCom(
  role: 'owner' | 'admin' | 'operator' | 'viewer',
  userId = 'u-chefe',
): RequestContext {
  return { tenantId: 'tenant-a', actor: { kind: 'team', userId, role } };
}

const cliente: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u-cli', customerId: 'c1' },
};

function comEquipe() {
  return fakeMembershipRepository([
    {
      tenantId: 'tenant-a',
      userId: 'u-chefe',
      email: 'chefe@drk.com',
      role: 'owner',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      tenantId: 'tenant-a',
      userId: 'u-guia',
      email: 'guia@drk.com',
      role: 'operator',
      createdAt: new Date('2026-02-01T00:00:00Z'),
    },
    {
      tenantId: 'tenant-b',
      userId: 'u-outro',
      email: 'outro@rival.com',
      role: 'owner',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
  ]);
}

/**
 * SEC-17 — listar quem tem acesso e tirar o acesso de alguém.
 *
 * Antes disto não existia nem uma coisa nem outra: convidar carimbava o papel no login do
 * Supabase e pronto. Para desligar alguém era preciso entrar no painel do Supabase e mexer
 * no usuário à mão — e mesmo assim o token já emitido seguia valendo até expirar.
 */
describe('SEC-17: quem tem acesso ao sistema', () => {
  describe('listar', () => {
    it('mostra só a equipe do próprio tenant', async () => {
      const memberships = comEquipe();

      const lista = await listTeamMembers({ memberships }, ctxCom('owner'));

      expect(lista.map((m) => m.email)).toEqual(['chefe@drk.com', 'guia@drk.com']);
    });

    it('cliente não lista a equipe', async () => {
      await expect(listTeamMembers({ memberships: comEquipe() }, cliente)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });

    it('operator não lista — saber quem tem acesso é informação de administração', async () => {
      await expect(
        listTeamMembers({ memberships: comEquipe() }, ctxCom('operator', 'u-guia')),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('tirar acesso', () => {
    it('owner tira o acesso de um membro e a linha some', async () => {
      const memberships = comEquipe();
      const audit = fakeAuditLogRepository();

      await revokeTeamAccess({ memberships, audit }, ctxCom('owner'), { userId: 'u-guia' });

      expect(await memberships.findByUser('tenant-a', 'u-guia')).toBeNull();
    });

    it('grava na trilha quem tirou o acesso de quem', async () => {
      const memberships = comEquipe();
      const audit = fakeAuditLogRepository();

      await revokeTeamAccess({ memberships, audit }, ctxCom('owner'), { userId: 'u-guia' });

      const linhas = await audit.listByEntity('tenant-a', 'membership', 'u-guia');
      expect(linhas[0]).toMatchObject({
        actorUserId: 'u-chefe',
        action: 'team_member.revoke',
        diff: { email: 'guia@drk.com', role: 'operator' },
      });
    });

    it('não deixa tirar o próprio acesso — sair sozinho tranca a porta por dentro', async () => {
      const memberships = comEquipe();
      const audit = fakeAuditLogRepository();

      await expect(
        revokeTeamAccess({ memberships, audit }, ctxCom('owner'), { userId: 'u-chefe' }),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(await memberships.findByUser('tenant-a', 'u-chefe')).not.toBeNull();
    });

    it('não alcança quem é de outro tenant — responde como se não existisse', async () => {
      const memberships = comEquipe();
      const audit = fakeAuditLogRepository();

      await expect(
        revokeTeamAccess({ memberships, audit }, ctxCom('owner'), { userId: 'u-outro' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(await memberships.findByUser('tenant-b', 'u-outro')).not.toBeNull();
    });

    it('operator não tira acesso de ninguém', async () => {
      const memberships = comEquipe();
      const audit = fakeAuditLogRepository();

      await expect(
        revokeTeamAccess({ memberships, audit }, ctxCom('operator', 'u-guia'), {
          userId: 'u-chefe',
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});

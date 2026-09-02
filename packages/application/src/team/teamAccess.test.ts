import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeMembershipRepository } from './membershipRepository.fake.js';
import { listTeamMembers } from './listTeamMembers.js';
import { revokeTeamAccess } from './revokeTeamAccess.js';
import { changeTeamRole } from './changeTeamRole.js';
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
      tenantId: 'tenant-a',
      userId: 'u-adm',
      email: 'adm@drk.com',
      role: 'admin' as const,
      createdAt: new Date('2026-03-01T00:00:00Z'),
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

      expect(lista.map((m) => m.email)).toEqual(['chefe@drk.com', 'guia@drk.com', 'adm@drk.com']);
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

/**
 * SEC-18 — trocar o papel de quem já está na equipe.
 *
 * Até aqui não havia caminho nenhum: convidar de novo não resolve (o Supabase recusa
 * recriar e-mail existente, 409/422) e tirar o acesso e reconvidar também não, porque o
 * login continua lá. A saída era UPDATE à mão no banco.
 *
 * O papel novo vale a partir da requisição seguinte, como a remoção: desde o SEC-17 quem
 * decide o que a pessoa pode é a linha de acesso, não o token.
 */
describe('SEC-18: trocar o papel de um membro', () => {
  it('owner rebaixa um operator para leitura', async () => {
    const memberships = comEquipe();
    const audit = fakeAuditLogRepository();

    await changeTeamRole({ memberships, audit }, ctxCom('owner'), {
      userId: 'u-guia',
      role: 'viewer',
    });

    expect(await memberships.findByUser('tenant-a', 'u-guia')).toMatchObject({ role: 'viewer' });
  });

  it('grava na trilha o papel antigo e o novo — é o que a investigação precisa', async () => {
    const memberships = comEquipe();
    const audit = fakeAuditLogRepository();

    await changeTeamRole({ memberships, audit }, ctxCom('owner'), {
      userId: 'u-guia',
      role: 'admin',
    });

    const linhas = await audit.listByEntity('tenant-a', 'membership', 'u-guia');
    expect(linhas[0]).toMatchObject({
      actorUserId: 'u-chefe',
      action: 'team_member.change_role',
      diff: { email: 'guia@drk.com', role: { from: 'operator', to: 'admin' } },
    });
  });

  it('trocar para o mesmo papel não gera linha na trilha', async () => {
    const memberships = comEquipe();
    const audit = fakeAuditLogRepository();

    await changeTeamRole({ memberships, audit }, ctxCom('owner'), {
      userId: 'u-guia',
      role: 'operator',
    });

    expect(await audit.listByEntity('tenant-a', 'membership', 'u-guia')).toHaveLength(0);
  });

  it('ninguém troca o próprio papel — seria promover a si mesmo', async () => {
    const memberships = comEquipe();
    const audit = fakeAuditLogRepository();

    await expect(
      changeTeamRole({ memberships, audit }, ctxCom('admin', 'u-adm'), {
        userId: 'u-adm',
        role: 'owner',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('operator não troca papel de ninguém', async () => {
    const memberships = comEquipe();
    const audit = fakeAuditLogRepository();

    await expect(
      changeTeamRole({ memberships, audit }, ctxCom('operator', 'u-guia'), {
        userId: 'u-adm',
        role: 'viewer',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('membro de outro tenant responde como se não existisse', async () => {
    const memberships = comEquipe();
    const audit = fakeAuditLogRepository();

    await expect(
      changeTeamRole({ memberships, audit }, ctxCom('owner'), {
        userId: 'u-outro',
        role: 'viewer',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

/**
 * SEC-18 — o dono não é mexido por quem ele nomeou.
 *
 * Buraco encontrado ao revisar o SEC-17 recém-entregue: `revokeTeamAccess` exigia apenas
 * owner **ou** admin, então um admin podia tirar o acesso do dono. O tenant ficaria sem
 * dono nenhum e quem nomeou o admin perderia o sistema — escalada de privilégio completa,
 * num clique. Vale igual para rebaixar.
 *
 * Promover a owner também é só do owner: é transferência de dono, não administração de
 * equipe. E é o que dá saída para o dono que vai embora — ele promove alguém antes.
 */
describe('SEC-18: só o owner mexe em outro owner', () => {
  it('admin não tira o acesso do owner', async () => {
    const memberships = comEquipe();
    const audit = fakeAuditLogRepository();

    await expect(
      revokeTeamAccess({ memberships, audit }, ctxCom('admin', 'u-adm'), { userId: 'u-chefe' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await memberships.findByUser('tenant-a', 'u-chefe')).not.toBeNull();
  });

  it('admin não rebaixa o owner', async () => {
    const memberships = comEquipe();
    const audit = fakeAuditLogRepository();

    await expect(
      changeTeamRole({ memberships, audit }, ctxCom('admin', 'u-adm'), {
        userId: 'u-chefe',
        role: 'viewer',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('admin não promove ninguém a owner, nem outra pessoa', async () => {
    const memberships = comEquipe();
    const audit = fakeAuditLogRepository();

    await expect(
      changeTeamRole({ memberships, audit }, ctxCom('admin', 'u-adm'), {
        userId: 'u-guia',
        role: 'owner',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('owner promove outro a owner — é a saída para quem vai embora', async () => {
    const memberships = comEquipe();
    const audit = fakeAuditLogRepository();

    await changeTeamRole({ memberships, audit }, ctxCom('owner'), {
      userId: 'u-guia',
      role: 'owner',
    });

    expect(await memberships.findByUser('tenant-a', 'u-guia')).toMatchObject({ role: 'owner' });
  });

  it('o último owner não some: ninguém se remove, e o admin não o alcança', async () => {
    const memberships = comEquipe();
    const audit = fakeAuditLogRepository();

    await expect(
      revokeTeamAccess({ memberships, audit }, ctxCom('owner'), { userId: 'u-chefe' }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      revokeTeamAccess({ memberships, audit }, ctxCom('admin', 'u-adm'), { userId: 'u-chefe' }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await memberships.findByUser('tenant-a', 'u-chefe')).not.toBeNull();
  });
});

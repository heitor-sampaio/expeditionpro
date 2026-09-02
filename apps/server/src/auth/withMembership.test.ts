import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '@expedition/application';
import { withMembershipCheck } from './withMembership.js';
import type { RequestContext } from '@expedition/application';
import type { FastifyRequest } from 'fastify';
import type { MembershipRecord, MembershipRepository } from '@expedition/application';

/*
 * Duplo local: os fakes da aplicação ficam fora do build, então o servidor não os alcança.
 * Só `findByUser` importa aqui — é o único método que a verificação de acesso usa.
 */
function fakeMembershipRepository(
  rows: readonly (MembershipRecord & { tenantId: string })[] = [],
): MembershipRepository {
  const naoUsado = () => Promise.reject(new Error('não usado nesta verificação'));
  return {
    findByUser: (tenantId, userId) =>
      Promise.resolve(rows.find((r) => r.tenantId === tenantId && r.userId === userId) ?? null),
    list: naoUsado,
    grant: naoUsado,
    revoke: naoUsado,
  };
}

const pedido = {} as FastifyRequest;

function resolverQueDevolve(ctx: RequestContext) {
  return () => Promise.resolve(ctx);
}

const equipe = (role: 'owner' | 'admin' | 'operator' | 'viewer'): RequestContext => ({
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u-guia', role },
});

function comAcesso(role: 'owner' | 'admin' | 'operator' | 'viewer') {
  return fakeMembershipRepository([
    {
      tenantId: 'tenant-a',
      userId: 'u-guia',
      email: 'guia@drk.com',
      role,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
  ]);
}

/**
 * SEC-17 — o token prova **quem** é a pessoa; o banco decide **o que** ela pode.
 *
 * Antes disto o papel vinha inteiro do `app_metadata` do token. Um token do Supabase vale
 * cerca de uma hora, então tirar alguém da equipe — quando havia como, pelo painel — não
 * tinha efeito nenhum até o token dela expirar. Uma hora é tempo de sobra para apagar uma
 * saída inteira.
 */
describe('SEC-17: o acesso é verificado a cada requisição', () => {
  it('sem linha de acesso, recusa — mesmo com token válido na mão', async () => {
    const resolve = withMembershipCheck(resolverQueDevolve(equipe('owner')), {
      memberships: fakeMembershipRepository(),
    });

    await expect(resolve(pedido)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('o papel vem do banco, não do token — rebaixar vale no ato', async () => {
    // Token diz owner; o banco diz viewer. Vale o banco.
    const resolve = withMembershipCheck(resolverQueDevolve(equipe('owner')), {
      memberships: comAcesso('viewer'),
    });

    const ctx = await resolve(pedido);

    expect(ctx.actor).toMatchObject({ kind: 'team', userId: 'u-guia', role: 'viewer' });
  });

  it('com acesso e papel igual, segue normalmente', async () => {
    const resolve = withMembershipCheck(resolverQueDevolve(equipe('operator')), {
      memberships: comAcesso('operator'),
    });

    expect((await resolve(pedido)).actor).toMatchObject({ role: 'operator' });
  });

  it('cliente não passa por esta verificação — não é membro de equipe', async () => {
    const cliente: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', userId: 'u-cli', customerId: 'c1' },
    };
    const memberships = fakeMembershipRepository();
    const resolve = withMembershipCheck(resolverQueDevolve(cliente), { memberships });

    expect(await resolve(pedido)).toEqual(cliente);
  });

  it('o acesso é por tenant: linha em outro tenant não serve', async () => {
    const memberships = fakeMembershipRepository([
      {
        tenantId: 'tenant-b',
        userId: 'u-guia',
        email: 'guia@drk.com',
        role: 'owner',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const resolve = withMembershipCheck(resolverQueDevolve(equipe('owner')), { memberships });

    await expect(resolve(pedido)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

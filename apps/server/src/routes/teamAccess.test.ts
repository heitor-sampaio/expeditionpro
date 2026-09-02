import { describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryServerDeps } from '../dev/inMemoryServerDeps.js';
import { inMemoryMemberships } from '../dev/inMemoryMemberships.js';
import type { RequestContext } from '@expedition/application';

const EQUIPE = [
  {
    tenantId: 'tenant-a',
    userId: 'u-chefe',
    email: 'chefe@drk.com',
    role: 'owner' as const,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    tenantId: 'tenant-a',
    userId: 'u-guia',
    email: 'guia@drk.com',
    role: 'operator' as const,
    createdAt: new Date('2026-02-01T00:00:00Z'),
  },
];

async function servidor(role: 'owner' | 'operator' = 'owner') {
  const memberships = inMemoryMemberships(EQUIPE);
  const ctx: RequestContext = {
    tenantId: 'tenant-a',
    actor: { kind: 'team', userId: role === 'owner' ? 'u-chefe' : 'u-guia', role },
  };
  const app = await buildServer({
    logger: false,
    deps: inMemoryServerDeps({ memberships, resolveContext: () => Promise.resolve(ctx) }),
  });
  await app.ready();
  return { app, memberships };
}

/**
 * SEC-17 — a tela de quem tem acesso, pelo HTTP.
 *
 * Antes disto, tirar o acesso de alguém só dava pelo painel do Supabase: não havia rota
 * nenhuma no ExpeditionPRO, e a tabela que guarda quem entra nunca era escrita.
 */
describe('SEC-17: rotas de acesso da equipe', () => {
  it('GET /v1/team/members lista quem tem acesso, sem expor o id do login', async () => {
    const { app } = await servidor();

    const res = await app.inject({ method: 'GET', url: '/v1/team/members' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { userId: 'u-chefe', email: 'chefe@drk.com', role: 'owner', since: '2026-01-01' },
      { userId: 'u-guia', email: 'guia@drk.com', role: 'operator', since: '2026-02-01' },
    ]);
    await app.close();
  });

  it('DELETE /v1/team/members/:userId tira o acesso e responde 204', async () => {
    const { app, memberships } = await servidor();

    const res = await app.inject({ method: 'DELETE', url: '/v1/team/members/u-guia' });

    expect(res.statusCode).toBe(204);
    expect(await memberships.findByUser('tenant-a', 'u-guia')).toBeNull();
    await app.close();
  });

  it('tirar acesso de quem não existe responde 404, não 204 fingindo sucesso', async () => {
    const { app } = await servidor();

    const res = await app.inject({ method: 'DELETE', url: '/v1/team/members/fantasma' });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('operator não lista nem tira acesso', async () => {
    const { app } = await servidor('operator');

    expect((await app.inject({ method: 'GET', url: '/v1/team/members' })).statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'DELETE', url: '/v1/team/members/u-chefe' })).statusCode,
    ).toBe(403);
    await app.close();
  });
});

/**
 * SEC-18 — trocar o papel pelo HTTP.
 *
 * A tela de acesso precisava de um caminho para isso: convidar de novo não resolve, porque
 * o Supabase recusa recriar e-mail existente.
 */
describe('SEC-18: PATCH /v1/team/members/:userId', () => {
  it('owner troca o papel e recebe 204', async () => {
    const { app, memberships } = await servidor();

    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/team/members/u-guia',
      payload: { role: 'admin' },
    });

    expect(res.statusCode).toBe(204);
    expect(await memberships.findByUser('tenant-a', 'u-guia')).toMatchObject({ role: 'admin' });
    await app.close();
  });

  it('papel fora da lista é recusado na borda, antes do caso de uso', async () => {
    const { app, memberships } = await servidor();

    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/team/members/u-guia',
      payload: { role: 'superusuario' },
    });

    expect(res.statusCode).toBe(400);
    expect(await memberships.findByUser('tenant-a', 'u-guia')).toMatchObject({ role: 'operator' });
    await app.close();
  });

  it('trocar o próprio papel responde 400, não 204', async () => {
    const { app } = await servidor();

    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/team/members/u-chefe',
      payload: { role: 'viewer' },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('operator não troca papel', async () => {
    const { app } = await servidor('operator');

    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/team/members/u-chefe',
      payload: { role: 'viewer' },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

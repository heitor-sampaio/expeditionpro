import { describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryServerDeps } from '../dev/inMemoryServerDeps.js';
import { inMemoryTenants } from '../dev/inMemoryTenants.js';
import type { RequestContext } from '@expedition/application';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

async function servidor() {
  const app = await buildServer({
    logger: false,
    deps: inMemoryServerDeps({
      tenants: inMemoryTenants(),
      resolveContext: () => Promise.resolve(ctx),
    }),
  });
  await app.ready();
  return app;
}

const CORPO = { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } };

/**
 * PG-03 · SEC — o webhook não conta quais tenants existem.
 *
 * O endereço é público por natureza: o ASAAS precisa alcançá-lo sem sessão, e o slug do
 * tenant está na URL. A autenticação é o segredo no cabeçalho.
 *
 * O problema era a **diferença** entre as duas recusas. Slug inexistente respondia 401
 * (a rota conferia e parava ali), enquanto slug existente com token errado chegava ao caso
 * de uso e voltava 403. Quem sondasse a URL com um token qualquer separava os dois grupos
 * na hora: 403 significa "este tenant existe e tem gateway conectado". É enumeração de
 * clientes da plataforma feita com uma requisição por chute — e num SaaS multi-tenant a
 * lista de quem usa o sistema é informação comercial.
 *
 * As duas recusas passam a ser a mesma resposta: 401, mesmo corpo.
 */
describe('PG-03: recusa do webhook não distingue tenant que existe', () => {
  it('slug inexistente responde 401', async () => {
    const app = await servidor();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/asaas/tenant-que-nao-existe',
      headers: { 'asaas-access-token': 'chute' },
      payload: CORPO,
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  // 'dev' é o slug que o duplo de tenants reconhece; 'tenant-que-nao-existe' não.
  it('slug existente com token errado responde exatamente igual', async () => {
    const app = await servidor();

    const inexistente = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/asaas/tenant-que-nao-existe',
      headers: { 'asaas-access-token': 'chute' },
      payload: CORPO,
    });
    const existente = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/asaas/dev',
      headers: { 'asaas-access-token': 'chute' },
      payload: CORPO,
    });

    expect(existente.statusCode).toBe(inexistente.statusCode);
    expect(existente.body).toBe(inexistente.body);
  });

  it('sem cabeçalho de token nenhum, também 401 — e nada que separe os dois casos', async () => {
    const app = await servidor();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/asaas/dev',
      payload: CORPO,
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

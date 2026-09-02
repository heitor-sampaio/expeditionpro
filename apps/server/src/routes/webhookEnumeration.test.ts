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

/**
 * Todo webhook público do sistema entra aqui.
 *
 * 'dev' é o slug que o duplo de tenants reconhece; 'tenant-que-nao-existe' não. Nenhum dos
 * dois tem provedor conectado no duplo — é exatamente o que se quer: as duas recusas têm de
 * ser indistinguíveis.
 */
const WEBHOOKS = [
  {
    nome: 'ASAAS (PG-03)',
    caminho: (slug: string) => `/v1/webhooks/asaas/${slug}`,
    header: 'asaas-access-token',
    corpo: { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } },
  },
  {
    nome: 'Evolution (AT-02)',
    caminho: (slug: string) => `/v1/webhooks/evolution/${slug}`,
    header: 'x-webhook-token',
    corpo: {
      event: 'messages.upsert',
      data: {
        key: { id: 'MSG-1', remoteJid: '5548999998877@s.whatsapp.net', fromMe: false },
        message: { conversation: 'oi' },
        messageTimestamp: 1788000000,
      },
    },
  },
];

/**
 * PG-03 · AT-02 · SEC — o webhook não conta quais tenants existem.
 *
 * O endereço é público por natureza: o provedor precisa alcançá-lo sem sessão, e o slug do
 * tenant está na URL. A autenticação é o segredo no cabeçalho.
 *
 * O problema era a **diferença** entre as duas recusas. Slug inexistente respondia 401
 * (a rota conferia e parava ali), enquanto slug existente com token errado chegava ao caso
 * de uso e voltava 403. Quem sondasse a URL com um token qualquer separava os dois grupos
 * na hora: 403 significa "este tenant existe e tem gateway conectado". É enumeração de
 * clientes da plataforma feita com uma requisição por chute — e num SaaS multi-tenant a
 * lista de quem usa o sistema é informação comercial.
 *
 * As duas recusas passam a ser a mesma resposta: 401, mesmo corpo. O teste é por tabela
 * porque a regra não é do ASAAS: vale para todo webhook que este sistema publicar, e o
 * segundo canal de entrada (mensagem) repetiria o mesmo erro se ninguém a cobrasse aqui.
 */
describe.each(WEBHOOKS)('$nome: recusa do webhook não distingue tenant que existe', (webhook) => {
  it('slug inexistente responde 401', async () => {
    const app = await servidor();

    const res = await app.inject({
      method: 'POST',
      url: webhook.caminho('tenant-que-nao-existe'),
      headers: { [webhook.header]: 'chute' },
      payload: webhook.corpo,
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('slug existente com token errado responde exatamente igual', async () => {
    const app = await servidor();

    const inexistente = await app.inject({
      method: 'POST',
      url: webhook.caminho('tenant-que-nao-existe'),
      headers: { [webhook.header]: 'chute' },
      payload: webhook.corpo,
    });
    const existente = await app.inject({
      method: 'POST',
      url: webhook.caminho('dev'),
      headers: { [webhook.header]: 'chute' },
      payload: webhook.corpo,
    });

    expect(existente.statusCode).toBe(inexistente.statusCode);
    expect(existente.body).toBe(inexistente.body);
    await app.close();
  });

  it('sem cabeçalho de token nenhum, também 401 — e nada que separe os dois casos', async () => {
    const app = await servidor();

    const res = await app.inject({
      method: 'POST',
      url: webhook.caminho('dev'),
      payload: webhook.corpo,
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

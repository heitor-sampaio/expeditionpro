import { describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryServerDeps } from '../dev/inMemoryServerDeps.js';
import type { RequestContext } from '@expedition/application';

/**
 * SEC-16 · CORS — o navegador só manda o que o preflight liberar.
 *
 * Bug em produção: editar cliente respondia "sem conexão com o servidor". O `OPTIONS` voltava
 * 204 e a requisição de verdade **nunca era enviada** — o navegador desistia antes, em
 * silêncio, porque o `access-control-allow-methods` dizia `GET,HEAD,POST`.
 *
 * Esse é o padrão do `@fastify/cors` quando não se declara `methods`, e eu não declarei. Todo
 * `PATCH`, `PUT` e `DELETE` do back-office estava bloqueado desde que a API ganhou host
 * próprio: editar cliente, remover etapa do funil, salvar taxas, desconectar canal.
 *
 * Nada pegou porque o servidor está certo — `app.inject` não faz preflight, e o teste de rota
 * chama o método direto. Só um teste que **pergunta ao preflight** enxerga isso.
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

const ORIGEM = 'https://app.drakkarexpedicoes.com.br';

/** Os métodos que a API de fato serve. Rota nova com método fora desta lista quebra aqui. */
const METODOS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

async function servidor() {
  const app = await buildServer({
    logger: false,
    corsOrigins: [ORIGEM],
    deps: inMemoryServerDeps({ resolveContext: () => Promise.resolve(ctx) }),
  });
  await app.ready();
  return app;
}

describe('SEC-16: o preflight libera os métodos que a API serve', () => {
  it.each(METODOS)('%s passa pelo preflight', async (metodo) => {
    const app = await servidor();

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/customers/qualquer',
      headers: {
        origin: ORIGEM,
        'access-control-request-method': metodo,
        'access-control-request-headers': 'content-type,authorization',
      },
    });

    expect(res.headers['access-control-allow-methods']).toContain(metodo);
    await app.close();
  });

  it('a origem do tenant é reconhecida', async () => {
    const app = await servidor();

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/customers/qualquer',
      headers: { origin: ORIGEM, 'access-control-request-method': 'PATCH' },
    });

    expect(res.headers['access-control-allow-origin']).toBe(ORIGEM);
    await app.close();
  });

  /** A lista de origens é o que separa o back-office do resto da internet (IN-24). */
  it('origem de fora não é reconhecida', async () => {
    const app = await servidor();

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/customers/qualquer',
      headers: {
        origin: 'https://site-qualquer.example',
        'access-control-request-method': 'PATCH',
      },
    });

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });
});

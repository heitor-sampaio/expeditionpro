import { describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryServerDeps } from '../dev/inMemoryServerDeps.js';
import type { RequestContext } from '@expedition/application';

/**
 * SEC-01 — o log de acesso não guarda o que a pessoa digitou na busca.
 *
 * A configuração anterior nomeava `req.query.q` na redação do pino e **não fazia efeito**: o
 * serializador padrão do Fastify não emite `query`, emite `url` — com a query string inteira
 * dentro. Quem procurasse um cliente pelo CPF deixava o CPF em claro no agregador de log.
 *
 * Este teste sobe o servidor de verdade e lê o que saiu no fluxo do logger, porque o buraco
 * não estava na função de redação: estava na **forma** do que é registrado. Só um teste que
 * olha a linha final pega isso.
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

async function servidorComLog() {
  const linhas: string[] = [];
  const app = await buildServer({
    logStream: {
      write: (linha: string) => {
        linhas.push(linha);
      },
    },
    deps: inMemoryServerDeps({ resolveContext: () => Promise.resolve(ctx) }),
  });
  await app.ready();
  return { app, linhas };
}

describe('SEC-01: o log de acesso não vaza o que foi buscado', () => {
  it('o termo da busca de clientes não aparece no log', async () => {
    const { app, linhas } = await servidorComLog();

    await app.inject({ method: 'GET', url: '/v1/customers?q=90000010057' });

    expect(linhas.join('\n')).not.toContain('90000010057');
    await app.close();
  });

  it('a rota continua no log — sem ela não há log de acesso nenhum', async () => {
    const { app, linhas } = await servidorComLog();

    await app.inject({ method: 'GET', url: '/v1/customers?q=90000010057' });

    expect(linhas.join('\n')).toContain('/v1/customers');
    await app.close();
  });

  /**
   * AT-02 — o segredo do webhook viaja no caminho quando o provedor não deixa mandar
   * cabeçalho. Ele é registrado por proxies que não controlamos; no nosso log, não entra.
   */
  it('o segredo do webhook no caminho não aparece no log', async () => {
    const { app, linhas } = await servidorComLog();

    await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev/SEGREDO-QUE-NAO-PODE-VAZAR',
      payload: { event: 'messages.upsert' },
    });

    expect(linhas.join('\n')).not.toContain('SEGREDO-QUE-NAO-PODE-VAZAR');
    expect(linhas.join('\n')).toContain('/v1/webhooks/evolution/dev');
    await app.close();
  });
});

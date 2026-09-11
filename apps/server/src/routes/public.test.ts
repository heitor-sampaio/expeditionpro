import { describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryServerDeps } from '../dev/inMemoryServerDeps.js';
import type { RequestContext } from '@expedition/application';
import type { FastifyInstance } from 'fastify';

/**
 * IN-25 — o link público de inscrição, pela borda.
 *
 * É a superfície que responde a um estranho: quem clica no botão do site de apresentação não
 * tem sessão, não tem chave e não é ninguém que o sistema conheça. O que se cobra aqui é o que
 * nenhum teste de unidade alcança — que a rota **existe sem autenticação**, que recusa igual
 * para tudo o que não é público, e que não devolve nada além do que vai na tela.
 */

const ctx: RequestContext = {
  tenantId: 'dev-tenant',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const PRECOS = {
  validFrom: '2025-01-01',
  coupleCents: 200000,
  soloCents: 120000,
  extraAdultCents: 80000,
  childMidCents: 60000,
  childYoungCents: 40000,
};

/** O relógio fixo: a lista depende de "hoje", e um teste que depende do dia é um teste que quebra. */
const HOJE = new Date('2026-09-11T12:00:00.000Z');

async function comSaidas(datas: readonly string[]) {
  const deps = inMemoryServerDeps({
    resolveContext: () => Promise.resolve(ctx),
    clock: () => HOJE,
  });
  const app = await buildServer({ logger: false, deps });
  await app.ready();

  const itinerario = (
    await app.inject({
      method: 'POST',
      url: '/v1/itineraries',
      payload: { name: 'Coxilha Rica', prices: PRECOS },
    })
  ).json() as { id: string };

  for (const inicio of datas) {
    await app.inject({
      method: 'POST',
      url: '/v1/schedule-events',
      payload: { itineraryId: itinerario.id, startDate: inicio, endDate: inicio },
    });
  }
  return { app };
}

/** O in-memory resolve o roteiro pelos grupos abertos; o slug é o que o link mandar. */
const LINK = '/v1/public/dev/enrollment-link?roteiro=coxilha-rica';

describe('IN-25: o link público abre sem autenticação nenhuma', () => {
  it('com o mês do link, devolve a saída daquele mês e as outras', async () => {
    const { app } = await comSaidas(['2027-01-15', '2027-02-20']);

    const res = await app.inject({ method: 'GET', url: `${LINK}&saida=jan-27` });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      match: { startDate: string } | null;
      alternatives: { startDate: string }[];
      saidaReconhecida: boolean;
    };
    expect(body.match?.startDate).toBe('2027-01-15');
    expect(body.alternatives.map((g) => g.startDate)).toEqual(['2027-02-20']);
    expect(body.saidaReconhecida).toBe(true);
    await app.close();
  });

  /** O anúncio que continuou rodando: a porta não fecha, as outras datas aparecem. */
  it('mês sem saída abre assim mesmo, com as alternativas', async () => {
    const { app } = await comSaidas(['2027-01-15']);

    const body = (await app.inject({ method: 'GET', url: `${LINK}&saida=jul-27` })).json() as {
      match: unknown;
      alternatives: unknown[];
    };

    expect(body.match).toBeNull();
    expect(body.alternatives).toHaveLength(1);
    await app.close();
  });

  /** Saída que já aconteceu não é oferecida: seria inscrição para uma viagem que já voltou. */
  it('saída passada não aparece', async () => {
    const { app } = await comSaidas(['2026-01-10']);

    const body = (await app.inject({ method: 'GET', url: LINK })).json() as {
      alternatives: unknown[];
    };

    expect(body.alternatives).toEqual([]);
    await app.close();
  });

  /** Forma errada para no Zod, antes do caso de uso: são duas camadas com papéis diferentes. */
  it.each(['13-27-99', 'janeiro-2027', '1-27'])('saida=%s é recusada na borda', async (bruto) => {
    const { app } = await comSaidas(['2027-01-15']);

    const res = await app.inject({ method: 'GET', url: `${LINK}&saida=${bruto}` });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  /**
   * SEC-20 — **a recusa é uma só.** Tenant inexistente e roteiro inexistente respondem
   * exatamente igual, corpo incluído. Distinguir os dois deixaria contar, por tentativa, quais
   * empresas usam o sistema — é a mesma regra que `webhookEnumeration.test.ts` fixou para os
   * webhooks, e ela não pode se perder aqui só porque o código de status é outro.
   */
  it('SEC-20: tenant inexistente e roteiro inexistente respondem igual', async () => {
    const { app } = await comSaidas(['2027-01-15']);

    const semTenant = await app.inject({
      method: 'GET',
      url: '/v1/public/nao-existe/enrollment-link?roteiro=coxilha-rica',
    });
    const semRoteiro = await app.inject({
      method: 'GET',
      url: '/v1/public/dev/enrollment-link?roteiro=nao-existe',
    });

    expect(semTenant.statusCode).toBe(semRoteiro.statusCode);
    expect(semTenant.json()).toEqual(semRoteiro.json());
    await app.close();
  });

  /**
   * SEC-01 — o que sai daqui é o que vai na tela. Sem id de roteiro, sem contagem de inscritos,
   * sem preço: quem lê é um estranho, e cada campo a mais é um campo que alguém vai raspar.
   */
  it('SEC-01: a saída não carrega id interno nem número de inscritos', async () => {
    const { app } = await comSaidas(['2027-01-15']);

    const body = (await app.inject({ method: 'GET', url: `${LINK}&saida=jan-27` })).json() as {
      match: Record<string, unknown>;
    };

    expect(Object.keys(body.match).sort()).toEqual([
      'endDate',
      'groupId',
      'name',
      'startDate',
      'vacancies',
    ]);
    await app.close();
  });
});

/**
 * IN-24 — as duas rotas que já existiam mudaram de arquivo, e **as URLs não mudaram**. Este
 * teste é o que torna a mudança de casa segura: um site de tenant apontando para elas não pode
 * perceber nada.
 */
describe('IN-24: a vitrine continua onde estava', () => {
  it('as saídas abertas e o form-schema respondem sem autenticação', async () => {
    const { app } = await comSaidas(['2027-01-15']);

    const grupos = await app.inject({ method: 'GET', url: '/v1/public/dev/groups?status=open' });
    const schema = await app.inject({ method: 'GET', url: '/v1/public/dev/form-schema' });

    expect(grupos.statusCode).toBe(200);
    expect(schema.statusCode).toBe(200);
    await app.close();
  });
});

/** Um servidor sem `deps` não registra rota nenhuma além do health — nem as públicas. */
describe('IN-25: sem dependências, a superfície pública não existe', () => {
  it('o link responde 404 num servidor sem deps', async () => {
    const app: FastifyInstance = await buildServer({ logger: false });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: LINK });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

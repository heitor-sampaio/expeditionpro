import { inMemoryVehicles } from '../dev/inMemoryVehicles.js';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryServerDeps } from '../dev/inMemoryServerDeps.js';
import type { CepDirectory, RequestContext } from '@expedition/application';
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
  it('com o mês do link, devolve aquela saída e mais nenhuma', async () => {
    const { app } = await comSaidas(['2027-01-15', '2027-02-20']);

    const res = await app.inject({ method: 'GET', url: `${LINK}&saida=jan-27` });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      match: { startDate: string } | null;
      alternatives: { startDate: string }[];
      saidaReconhecida: boolean;
    };
    expect(body.match?.startDate).toBe('2027-01-15');
    // O link já escolheu; a resposta pública nem chega a listar a agenda do roteiro.
    expect(body.alternatives).toEqual([]);
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

/**
 * IN-25b · SEC-20 — a inscrição que vem da página pública.
 *
 * É a **única escrita do sistema sem segredo nenhum**. Não há chave para conferir, então o que
 * se cobra aqui são as defesas que sobraram: o contrato fechado, o teto do corpo, o limite por
 * IP — e o fato de nada virar cliente nem inscrição sem alguém alocar na fila.
 */
describe('IN-25b: a inscrição pública entra na fila', () => {
  const corpo = (extra: Record<string, unknown> = {}) => ({
    roteiro: 'coxilha-rica',
    groupId: 'dev-group-1',
    saida: 'jan-27',
    responsible: {
      full_name: 'Vanessa Santos',
      cpf: '900.000.100-57',
      birth_date: '1989-01-14',
      email: 'vanessa@exemplo.com',
      phone: '48999998877',
    },
    consent: true,
    ...extra,
  });

  async function comLink() {
    const { app } = await comSaidas(['2027-01-15']);
    const link = (await app.inject({ method: 'GET', url: `${LINK}&saida=jan-27` })).json() as {
      match: { groupId: string };
    };
    return { app, groupId: link.match.groupId };
  }

  it('responde 202 e vai para a fila, com a saída do link', async () => {
    const { app, groupId } = await comLink();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/dev/enrollments',
      payload: corpo({ groupId }),
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: 'queued' });

    // A prova de que a equipe vai encontrá-la: a fila é a mesma de sempre.
    const fila = (await app.inject({ method: 'GET', url: '/v1/intake' })).json() as {
      responsibleName: string;
      source: string;
    }[];
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({ responsibleName: 'Vanessa Santos', source: 'site' });
    await app.close();
  });

  /** Duplo clique no celular, que acontece porque a resposta demora o tempo de uma rede móvel. */
  it('a segunda submissão responde 200 duplicate, sem segunda linha na fila', async () => {
    const { app, groupId } = await comLink();
    await app.inject({
      method: 'POST',
      url: '/v1/public/dev/enrollments',
      payload: corpo({ groupId }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/dev/enrollments',
      payload: corpo({ groupId }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'duplicate' });
    expect((await app.inject({ method: 'GET', url: '/v1/intake' })).json()).toHaveLength(1);
    await app.close();
  });

  /** IN-05: o campo culpado volta para quem está preenchendo, e o que ela digitou não se perde. */
  it('CPF inválido responde 422 com o campo culpado', async () => {
    const { app, groupId } = await comLink();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/dev/enrollments',
      payload: corpo({ groupId, responsible: { ...corpo().responsible, cpf: '111.111.111-11' } }),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: 'validation_failed' });
    await app.close();
  });

  /**
   * SEC-20 — **o `groupId` do navegador não vale nada até ser conferido.** Sem isso, editar a
   * requisição inscreveria alguém numa saída privada ou de outro roteiro, e o preço daquela
   * saída seria congelado na alocação como se fosse legítimo.
   */
  it('SEC-20: grupo que não é do roteiro do link é recusado', async () => {
    const { app } = await comLink();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/dev/enrollments',
      payload: corpo({ groupId: 'grupo-de-outro-roteiro' }),
    });

    expect(res.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/v1/intake' })).json()).toHaveLength(0);
    await app.close();
  });

  /**
   * SEC-20 — o contrato é **fechado**. O webhook aceita corpo arbitrário porque o formulário é
   * de terceiro; aqui o formulário é nosso, e não há motivo para aceitar o que não se pediu.
   */
  it('SEC-20: chave desconhecida no corpo é recusada', async () => {
    const { app, groupId } = await comLink();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/dev/enrollments',
      payload: corpo({ groupId, admin: true }),
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  /** Sem teto, um corpo com dez mil acompanhantes viraria dez mil validações. */
  it('SEC-20: acompanhantes acima do teto são recusados', async () => {
    const { app, groupId } = await comLink();
    const muitos = Array.from({ length: 20 }, (_, i) => ({
      full_name: `Pessoa ${String(i)}`,
      cpf: '111.444.777-35',
      birth_date: '2015-03-22',
    }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/dev/enrollments',
      payload: corpo({ groupId, companions: muitos }),
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  /** A inscrição não existe ainda: existe um item de fila, e quem a cria é a equipe ao alocar. */
  it('nenhuma inscrição é criada antes de a equipe alocar', async () => {
    const { app, groupId } = await comLink();

    await app.inject({
      method: 'POST',
      url: '/v1/public/dev/enrollments',
      payload: corpo({ groupId }),
    });

    const recentes = (await app.inject({ method: 'GET', url: '/v1/bookings/recent' })).json();
    expect(recentes).toEqual([]);
    await app.close();
  });
});

/**
 * CL-02 · SEC-20 — a consulta de CEP é servida por nós, e não pelo navegador.
 *
 * A rota existe porque a CSP do front não lista o ViaCEP em `connect-src` — a consulta feita
 * na tela vinha sendo bloqueada em silêncio — e porque a página de inscrição é pública:
 * chamá-lo de lá daria a um terceiro o IP de todo interessado.
 *
 * **Sem `tenantSlug` no caminho, de propósito.** É a única rota deste arquivo sem ele, e é
 * honesto que seja: um CEP não é dado de tenant nenhum, e pedir o slug fingiria uma ligação
 * que não existe — além de uma consulta a mais por letra digitada.
 */
describe('CL-02: consulta de CEP sem autenticação', () => {
  async function comCep(directory: CepDirectory) {
    const deps = {
      ...inMemoryServerDeps({ resolveContext: () => Promise.resolve(ctx) }),
      ceps: directory,
    };
    const app = await buildServer({ logger: false, deps });
    await app.ready();
    return app;
  }

  const encontrado: CepDirectory = {
    lookup: () =>
      Promise.resolve({
        street: 'Rua Felipe Schmidt',
        district: 'Centro',
        city: 'Florianópolis',
        state: 'SC',
      }),
  };

  it('devolve o endereço, sem sessão nenhuma', async () => {
    const app = await comCep(encontrado);

    const res = await app.inject({ method: 'GET', url: '/v1/public/cep/88010000' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      street: 'Rua Felipe Schmidt',
      district: 'Centro',
      city: 'Florianópolis',
      state: 'SC',
    });
    await app.close();
  });

  it('aceita o CEP pontuado, como quem digita escreve', async () => {
    const app = await comCep(encontrado);

    const res = await app.inject({ method: 'GET', url: '/v1/public/cep/88010-000' });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  /** CEP que não existe é resposta, não erro: a tela segue com o preenchimento à mão. */
  it('CEP inexistente responde 404, e a tela sabe o que fazer', async () => {
    // O 404 é conferido junto com a consulta: sozinho, ele passaria igual se a rota não
    // existisse — o 404 de rota inexistente tem o mesmo corpo.
    let pedidos = 0;
    const app = await comCep({
      lookup: () => {
        pedidos += 1;
        return Promise.resolve(null);
      },
    });

    const res = await app.inject({ method: 'GET', url: '/v1/public/cep/99999999' });

    expect(res.statusCode).toBe(404);
    expect(pedidos).toBe(1);
    await app.close();
  });

  it('CEP malformado não chega ao diretório', async () => {
    let pedidos = 0;
    const app = await comCep({
      lookup: () => {
        pedidos += 1;
        return Promise.resolve(null);
      },
    });

    const res = await app.inject({ method: 'GET', url: '/v1/public/cep/abc' });

    expect(res.statusCode).toBe(400);
    expect(pedidos).toBe(0);
    await app.close();
  });
});

/**
 * CL-05 · IN-25 — o catálogo de veículos sem autenticação.
 *
 * Existe porque a inscrição do site pede marca e modelo, e digitar "Hilux" à mão produz
 * "hilux", "Hillux" e "Toyota Hilux" — três veículos onde há um. O combobox é o que faz a
 * inscrição chegar com o nome que o catálogo já usa.
 */
describe('CL-05: o catálogo de veículos sem sessão', () => {
  const MARCAS = [{ id: 'b-ford', tenantId: 'dev-tenant', name: 'Ford', isActive: true }];
  const MODELOS = [
    { id: 'm-ranger', tenantId: 'dev-tenant', brandId: 'b-ford', name: 'Ranger', isActive: true },
  ];

  async function comCatalogo() {
    const deps = {
      ...inMemoryServerDeps({ resolveContext: () => Promise.resolve(ctx) }),
      vehicles: inMemoryVehicles({ brands: MARCAS, models: MODELOS }),
    };
    const app = await buildServer({ logger: false, deps });
    await app.ready();
    return app;
  }

  it('lista as marcas do tenant do link, sem autenticação', async () => {
    const app = await comCatalogo();

    const res = await app.inject({ method: 'GET', url: '/v1/public/dev/vehicle-brands' });

    expect(res.statusCode).toBe(200);
    const marcas = res.json() as { id: string; name: string }[];
    expect(marcas.length).toBeGreaterThan(0);
    expect(Object.keys(marcas[0]!).sort()).toEqual(['id', 'name']);
    await app.close();
  });

  it('lista os modelos da marca, em cascata', async () => {
    const app = await comCatalogo();
    const marcas = (
      await app.inject({ method: 'GET', url: '/v1/public/dev/vehicle-brands' })
    ).json() as { id: string; name: string }[];

    const res = await app.inject({
      method: 'GET',
      url: `/v1/public/dev/vehicle-brands/${marcas[0]!.id}/models`,
    });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    await app.close();
  });

  /** A recusa é uma só: lista vazia não confirma nem nega que a empresa usa o sistema. */
  it('tenant inexistente devolve lista vazia, e não 404', async () => {
    const app = await comCatalogo();

    const res = await app.inject({ method: 'GET', url: '/v1/public/nao-existe/vehicle-brands' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  /** Marca de outro tenant não vaza modelo: quem filtra é o repositório, por tenant. */
  it('marca que não é do tenant não devolve modelo nenhum', async () => {
    const app = await comCatalogo();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/dev/vehicle-brands/00000000-0000-0000-0000-000000000000/models',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });
});

import { describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryServerDeps } from '../dev/inMemoryServerDeps.js';
import { inMemoryAutomations } from '../dev/inMemoryAutomations.js';
import type { RequestContext } from '@expedition/application';

/**
 * §5.18 — as automações pelo HTTP.
 *
 * A borda valida e traduz; a regra mora no caso de uso e está testada lá. O que se cobra aqui
 * é o que só existe na borda: o código de status certo, o corpo recusado antes de chegar na
 * regra, e o motivo da recusa chegando à tela em vez de virar 500 anônimo.
 */

const GRAFO = {
  nodes: [
    {
      id: 'trigger',
      kind: 'trigger',
      type: 'message_received',
      config: {},
      position: { x: 0, y: 0 },
    },
    { id: 'fim', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 120 } },
  ],
  edges: [{ id: 'e1', from: 'trigger', port: 'next', to: 'fim' }],
};

async function servidor(role: 'owner' | 'operator' = 'owner') {
  const automations = inMemoryAutomations();
  const ctx: RequestContext = {
    tenantId: 'tenant-a',
    actor: { kind: 'team', userId: 'u-ana', role },
  };
  const app = await buildServer({
    logger: false,
    deps: inMemoryServerDeps({ automations, resolveContext: () => Promise.resolve(ctx) }),
  });
  await app.ready();
  return { app, automations };
}

async function criar(app: Awaited<ReturnType<typeof servidor>>['app'], name = 'Follow-up') {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/automations',
    payload: { name },
  });
  return res.json() as { id: string };
}

describe('AU-02: criar e listar', () => {
  /** AU-14: criar pede o nome. O gatilho é bloco do quadro, e chega com o desenho. */
  it('cria desligada e sem gatilho, e devolve 201', async () => {
    const { app } = await servidor();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/automations',
      payload: { name: 'Follow-up' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ enabled: false, triggerType: null });
    await app.close();
  });

  /**
   * AU-14 — a lista fechada de gatilhos mudou de lugar, não deixou de existir: quem recusa
   * agora é o domínio, ao salvar o desenho, e o motivo sobe junto.
   */
  it('gatilho fora da lista é recusado ao salvar o desenho', async () => {
    const { app } = await servidor();
    const { id } = await criar(app);

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/automations/${id}/graph`,
      payload: {
        graph: {
          nodes: [
            {
              id: 'g1',
              kind: 'trigger',
              type: 'quando_der_vontade',
              config: {},
              position: { x: 0, y: 0 },
            },
            { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 90 } },
          ],
          edges: [{ id: 'e1', from: 'g1', port: 'next', to: 'f1' }],
        },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_graph' });
    await app.close();
  });

  it('operator lê a lista — quem atende precisa saber o que responde sozinho', async () => {
    const { app } = await servidor('operator');

    const res = await app.inject({ method: 'GET', url: '/v1/automations' });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('operator não cria', async () => {
    const { app } = await servidor('operator');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/automations',
      payload: { name: 'X' },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('automação inexistente responde 404', async () => {
    const { app } = await servidor();

    const res = await app.inject({ method: 'GET', url: '/v1/automations/nao-existe' });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('AU-07: salvar o desenho', () => {
  it('grafo válido responde 200', async () => {
    const { app } = await servidor();
    const criada = await criar(app);

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/automations/${criada.id}/graph`,
      payload: { graph: GRAFO },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  /** O motivo sobe até a tela: "não deu" não conserta desenho nenhum. */
  it('grafo inválido responde 400 dizendo o que está errado', async () => {
    const { app } = await servidor();
    const criada = await criar(app);

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/automations/${criada.id}/graph`,
      payload: { graph: { nodes: [GRAFO.nodes[0]], edges: [] } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_graph' });
    await app.close();
  });

  it('bloco de espécie desconhecida é recusado na borda', async () => {
    const { app } = await servidor();
    const criada = await criar(app);

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/automations/${criada.id}/graph`,
      payload: {
        graph: {
          nodes: [{ ...GRAFO.nodes[0], kind: 'invente_um' }],
          edges: [],
        },
      },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('AU-02: ligar e desligar', () => {
  it('liga depois do desenho pronto', async () => {
    const { app } = await servidor();
    const criada = await criar(app);
    await app.inject({
      method: 'PUT',
      url: `/v1/automations/${criada.id}/graph`,
      payload: { graph: GRAFO },
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/automations/${criada.id}/enabled`,
      payload: { enabled: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ enabled: true, runAsUserId: 'u-ana' });
    await app.close();
  });

  it('não liga com o desenho pela metade', async () => {
    const { app } = await servidor();
    const criada = await criar(app);

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/automations/${criada.id}/enabled`,
      payload: { enabled: true },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('apagar responde 204', async () => {
    const { app } = await servidor();
    const criada = await criar(app);

    const res = await app.inject({ method: 'DELETE', url: `/v1/automations/${criada.id}` });

    expect(res.statusCode).toBe(204);
    await app.close();
  });
});

/**
 * AU-07 — o motivo da recusa precisa **chegar à tela**.
 *
 * O caso de uso monta a frase ("o gatilho não leva a lugar nenhum; há bloco que nenhum caminho
 * alcança") e a tela sabe mostrá-la, mas o tratador de erro global mandava só o código: quem
 * estava desenhando via "o desenho não fecha" e nenhuma pista de qual das dez regras quebrou.
 *
 * A mensagem sobe por **lista explícita**, e não para todo erro de negócio: é a mesma regra de
 * DTO por audiência (§11.7). Estes códigos carregam texto escrito para quem lê a tela.
 */
describe('AU-07: o motivo da recusa sobe até a tela', () => {
  it('grafo inválido responde com a lista do que está errado', async () => {
    const { app } = await servidor();
    const criada = await criar(app);

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/automations/${criada.id}/graph`,
      payload: { graph: { nodes: [GRAFO.nodes[0]], edges: [] } },
    });

    expect(res.json()).toMatchObject({
      error: 'invalid_graph',
      message: expect.stringContaining('gatilho não leva a lugar nenhum'),
    });
    await app.close();
  });

  /** Erro de negócio fora da lista continua só com o código: a tela é que traduz. */
  it('nome repetido não vaza mensagem', async () => {
    const { app } = await servidor();
    await criar(app, 'Follow-up');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/automations',
      payload: { name: 'Follow-up' },
    });

    expect(res.json()).toEqual({ error: 'duplicate_automation' });
    await app.close();
  });
});

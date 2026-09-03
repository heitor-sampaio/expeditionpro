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
    payload: { name, triggerType: 'message_received' },
  });
  return res.json() as { id: string };
}

describe('AU-02: criar e listar', () => {
  it('cria desligada e devolve 201', async () => {
    const { app } = await servidor();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/automations',
      payload: { name: 'Follow-up', triggerType: 'message_received' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ enabled: false, triggerType: 'message_received' });
    await app.close();
  });

  it('gatilho fora da lista é recusado na borda', async () => {
    const { app } = await servidor();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/automations',
      payload: { name: 'X', triggerType: 'quando_der_vontade' },
    });

    expect(res.statusCode).toBe(400);
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
      payload: { name: 'X', triggerType: 'message_received' },
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

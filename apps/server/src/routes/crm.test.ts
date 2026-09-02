import { describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryServerDeps } from '../dev/inMemoryServerDeps.js';
import { inMemoryOpportunities } from '../dev/inMemoryOpportunities.js';
import type { RequestContext } from '@expedition/application';

function servidorCom(role: 'owner' | 'operator' | 'viewer' = 'owner') {
  const opportunities = inMemoryOpportunities([
    {
      tenantId: 'tenant-a',
      id: 's-novo',
      name: 'Novo',
      position: 0,
      kind: 'open',
      archivedAt: null,
    },
    {
      tenantId: 'tenant-a',
      id: 's-conversa',
      name: 'Conversando',
      position: 1,
      kind: 'open',
      archivedAt: null,
    },
    {
      tenantId: 'tenant-a',
      id: 's-perda',
      name: 'Perdido',
      position: 2,
      kind: 'lost',
      archivedAt: null,
    },
  ]);
  const ctx: RequestContext = {
    tenantId: 'tenant-a',
    actor: { kind: 'team', userId: 'u1', role },
  };
  return { opportunities, ctx };
}

async function servidor(role: 'owner' | 'operator' | 'viewer' = 'owner') {
  const { opportunities, ctx } = servidorCom(role);
  const app = await buildServer({
    logger: false,
    deps: inMemoryServerDeps({ opportunities, resolveContext: () => Promise.resolve(ctx) }),
  });
  await app.ready();
  return { app, opportunities };
}

/**
 * §5.16 — o funil pelo HTTP.
 *
 * A borda faz o que a borda faz neste projeto: valida com Zod e traduz para DTO. Nenhuma
 * regra mora aqui — mover cartão, bloquear ganho e exigir motivo de perda são do caso de uso,
 * e é lá que estão testados.
 */
describe('OP-09: GET /v1/crm/board', () => {
  it('devolve as colunas na ordem do funil, incluindo as vazias', async () => {
    const { app } = await servidor();

    const res = await app.inject({ method: 'GET', url: '/v1/crm/board' });

    expect(res.statusCode).toBe(200);
    expect(res.json().map((c: { stage: { name: string } }) => c.stage.name)).toEqual([
      'Novo',
      'Conversando',
      'Perdido',
    ]);
    await app.close();
  });

  it('viewer lê o quadro — somente leitura não é cegueira', async () => {
    const { app } = await servidor('viewer');

    expect((await app.inject({ method: 'GET', url: '/v1/crm/board' })).statusCode).toBe(200);
    await app.close();
  });
});

describe('OP-03: POST /v1/crm/opportunities', () => {
  it('cria com nome só, e devolve 201', async () => {
    const { app } = await servidor('operator');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/crm/opportunities',
      payload: { contactName: 'Ana Prado' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ contactName: 'Ana Prado', stageId: 's-novo' });
    await app.close();
  });

  it('telefone sai formatado no DTO — a equipe liga a partir da tela', async () => {
    const { app } = await servidor('operator');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/crm/opportunities',
      payload: { contactName: 'Ana Prado', phone: '48999998877' },
    });

    // O formato é o do projeto inteiro (`formatPhone`), não um inventado aqui.
    expect(res.json()).toMatchObject({ phone: '+55 (48)99999-8877' });
    await app.close();
  });

  it('nome vazio é recusado na borda, antes do caso de uso', async () => {
    const { app } = await servidor('operator');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/crm/opportunities',
      payload: { contactName: '' },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('viewer não cria', async () => {
    const { app } = await servidor('viewer');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/crm/opportunities',
      payload: { contactName: 'Ana Prado' },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('OP-05: PATCH /v1/crm/opportunities/:id/stage', () => {
  async function comCartao() {
    const { app } = await servidor('operator');
    const criada = await app.inject({
      method: 'POST',
      url: '/v1/crm/opportunities',
      payload: { contactName: 'Ana Prado' },
    });
    return { app, id: criada.json().id as string };
  }

  it('move e devolve o cartão na etapa nova', async () => {
    const { app, id } = await comCartao();

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/crm/opportunities/${id}/stage`,
      payload: { stageId: 's-conversa' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ stageId: 's-conversa' });
    await app.close();
  });

  it('perder sem motivo responde 400 — a regra é do caso de uso e chega inteira aqui', async () => {
    const { app, id } = await comCartao();

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/crm/opportunities/${id}/stage`,
      payload: { stageId: 's-perda' },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('OP-01: as etapas', () => {
  it('owner cria etapa', async () => {
    const { app } = await servidor('owner');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/crm/stages',
      payload: { name: 'Proposta enviada', kind: 'open' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: 'Proposta enviada', position: 3 });
    await app.close();
  });

  it('operator não configura o funil', async () => {
    const { app } = await servidor('operator');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/crm/stages',
      payload: { name: 'X', kind: 'open' },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('reordenar aceita a lista completa e responde 204', async () => {
    const { app } = await servidor('owner');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/crm/stages/reorder',
      payload: { orderedStageIds: ['s-conversa', 's-novo', 's-perda'] },
    });

    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it('arquivar etapa vazia responde 204', async () => {
    const { app } = await servidor('owner');

    const res = await app.inject({ method: 'DELETE', url: '/v1/crm/stages/s-conversa' });

    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it('kind fora da lista é recusado na borda', async () => {
    const { app } = await servidor('owner');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/crm/stages',
      payload: { name: 'X', kind: 'talvez' },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

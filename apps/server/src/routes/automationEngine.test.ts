import { describe, expect, it, vi } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryServerDeps } from '../dev/inMemoryServerDeps.js';
import { inMemoryAutomations, inMemoryAutomationRuns } from '../dev/inMemoryAutomations.js';
import { inMemoryChannelIntegrations, inMemoryConversations } from '../dev/inMemoryMessaging.js';
import type { ServerDeps } from '../buildServer.js';
import type { RequestContext } from '@expedition/application';

/**
 * AU-04 · AU-05 — a automação ponta a ponta, pela borda.
 *
 * O que se cobra aqui é justamente o que nenhum teste de unidade alcança: que o **gatilho
 * esteja ligado na rota certa**. Um motor perfeito com o disparo faltando numa borda é uma
 * automação que a equipe liga e que nunca roda — e nada acusa, porque não há erro.
 *
 * O motor fica desligado nos outros testes de rota de propósito; aqui ele é ligado e
 * empurrado à mão com `tick`, para as asserções não dependerem de temporizador.
 */

const GRAFO = {
  nodes: [
    { id: 'g1', kind: 'trigger', type: 'message_received', config: {}, position: { x: 0, y: 0 } },
    {
      id: 'c1',
      kind: 'condition',
      type: 'field',
      config: { field: 'mensagem.texto', operator: 'contains', value: 'preço' },
      position: { x: 0, y: 60 },
    },
    {
      id: 'a1',
      kind: 'action',
      type: 'send_message',
      config: { text: 'Oi {{contato.nome}}! O valor sai por…' },
      position: { x: 0, y: 120 },
    },
    { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 120, y: 120 } },
  ],
  edges: [
    { id: 'e1', from: 'g1', port: 'next', to: 'c1' },
    { id: 'e2', from: 'c1', port: 'true', to: 'a1' },
    { id: 'e3', from: 'c1', port: 'false', to: 'f1' },
    { id: 'e4', from: 'a1', port: 'next', to: 'f1' },
  ],
};

function corpoDaEvolution(texto: string, id = 'MSG-1') {
  return {
    event: 'messages.upsert',
    data: {
      key: { remoteJid: '5548999998877@s.whatsapp.net', fromMe: false, id },
      pushName: 'Ana Prado',
      message: { conversation: texto },
      messageTimestamp: 1788000000,
    },
  };
}

const TENANT = 'dev-tenant';

async function comMotor() {
  const automations = inMemoryAutomations();
  const runs = inMemoryAutomationRuns();
  const enviar = vi.fn().mockResolvedValue({ ok: true, externalId: 'OUT-1' });
  const ctx: RequestContext = {
    tenantId: TENANT,
    actor: { kind: 'team', userId: 'u-ana', role: 'owner' },
  };

  const base = inMemoryServerDeps({
    automations,
    ...runs,
    conversations: inMemoryConversations(),
    channelIntegrations: inMemoryChannelIntegrations([
      {
        tenantId: TENANT,
        id: 'ch-1',
        channel: 'whatsapp',
        provider: 'evolution',
        baseUrl: 'https://evo.local',
        externalAccountId: 'drakkar',
        accessToken: 'CHAVE',
        allowedIps: [],
        webhookToken: 'SEGREDO',
        active: true,
        connectedAt: new Date('2026-09-01T00:00:00Z'),
      },
    ]),
    resolveContext: () => Promise.resolve(ctx),
  });
  // AU-03: o papel de quem liga a automação é relido a cada execução.
  await base.memberships.grant(TENANT, 'u-ana', 'ana@drakkar.com.br', 'owner');

  const deps: ServerDeps = {
    ...base,
    messagingGateway: { sendText: enviar, sendMedia: vi.fn() },
  };
  const app = await buildServer({ logger: false, deps, automationEngine: true });
  await app.ready();
  return { app, deps, automations, runs, enviar };
}

/** Cria a automação pelas rotas, exatamente como a tela faz, e liga. */
async function ligarAutomacao(app: Awaited<ReturnType<typeof comMotor>>['app']) {
  const criada = (
    await app.inject({
      method: 'POST',
      url: '/v1/automations',
      payload: { name: 'Responder preço', triggerType: 'message_received' },
    })
  ).json() as { id: string };

  await app.inject({
    method: 'PUT',
    url: `/v1/automations/${criada.id}/graph`,
    payload: { graph: GRAFO },
  });
  const ligou = await app.inject({
    method: 'PUT',
    url: `/v1/automations/${criada.id}/enabled`,
    payload: { enabled: true },
  });
  expect(ligou.statusCode).toBe(200);
  return criada;
}

describe('AU-04: o gatilho está ligado na borda do webhook', () => {
  it('mensagem recebida abre execução para a automação ligada', async () => {
    const { app, runs, automations } = await comMotor();
    await ligarAutomacao(app);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: corpoDaEvolution('quanto custa?'),
    });

    expect(res.statusCode).toBe(200);
    const abertas = await runs.automationRuns.listByAutomation(TENANT, automations.rows[0]!.id, 10);
    expect(abertas).toHaveLength(1);
    await app.close();
  });

  /**
   * O disparo é best-effort, como o `fireBookingNotification`: a automação falhando não pode
   * derrubar o webhook. Se derrubasse, a Evolution veria erro, tentaria de novo, e uma
   * automação quebrada viraria mensagem duplicada no fio — o oposto do que ela deveria fazer.
   */
  it('automação que falha não derruba o webhook', async () => {
    const { app, enviar } = await comMotor();
    enviar.mockRejectedValue(new Error('instância desconectada'));
    await ligarAutomacao(app);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: corpoDaEvolution('quanto custa o preço?'),
    });
    await app.inject({ method: 'POST', url: '/v1/automations/tick' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ handled: true });
    await app.close();
  });

  /** E a mensagem do cliente continua no fio: o que ela dispara é assunto separado. */
  it('a mensagem é gravada mesmo quando a automação falha', async () => {
    const { app, deps, enviar } = await comMotor();
    enviar.mockRejectedValue(new Error('instância desconectada'));
    await ligarAutomacao(app);

    await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: corpoDaEvolution('quanto custa o preço?'),
    });
    await app.inject({ method: 'POST', url: '/v1/automations/tick' });

    const conversas = await deps.conversations.listConversations(TENANT);
    expect(conversas).toHaveLength(1);
    await app.close();
  });

  it('a condição decide, e a resposta sai com a variável trocada', async () => {
    const { app, enviar } = await comMotor();
    await ligarAutomacao(app);
    await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: corpoDaEvolution('me diz o preço por favor'),
    });

    await app.inject({ method: 'POST', url: '/v1/automations/tick' });

    expect(enviar).toHaveBeenCalledOnce();
    expect(enviar.mock.calls[0]?.[0]).toMatchObject({
      text: 'Oi Ana Prado! O valor sai por…',
    });
    await app.close();
  });

  it('mensagem que não casa com a condição segue pelo não e não responde', async () => {
    const { app, enviar } = await comMotor();
    await ligarAutomacao(app);
    await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: corpoDaEvolution('bom dia, tudo bem?'),
    });

    await app.inject({ method: 'POST', url: '/v1/automations/tick' });

    expect(enviar).not.toHaveBeenCalled();
    await app.close();
  });

  /**
   * AU-05 — a proteção que faz o laço não existir. A resposta da automação volta pelo eco do
   * provedor como mensagem que **sai**; se isso disparasse de novo, o motor responderia à
   * própria resposta para sempre.
   */
  it('a resposta da automação não dispara outra automação', async () => {
    const { app, enviar, automations, runs } = await comMotor();
    await ligarAutomacao(app);
    await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: corpoDaEvolution('preço?'),
    });
    await app.inject({ method: 'POST', url: '/v1/automations/tick' });

    // O eco: a mesma mensagem voltando do provedor, agora marcada como nossa.
    await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: {
        event: 'messages.upsert',
        data: {
          key: { remoteJid: '5548999998877@s.whatsapp.net', fromMe: true, id: 'OUT-1' },
          message: { conversation: 'Oi Ana Prado! O valor sai por…' },
          messageTimestamp: 1788000100,
        },
      },
    });
    await app.inject({ method: 'POST', url: '/v1/automations/tick' });

    expect(enviar).toHaveBeenCalledOnce();
    const todas = await runs.automationRuns.listByAutomation(TENANT, automations.rows[0]!.id, 10);
    expect(todas).toHaveLength(1);
    await app.close();
  });

  it('automação desligada não abre execução nenhuma', async () => {
    const { app, runs, automations } = await comMotor();
    const criada = await ligarAutomacao(app);
    await app.inject({
      method: 'PUT',
      url: `/v1/automations/${criada.id}/enabled`,
      payload: { enabled: false },
    });

    await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: corpoDaEvolution('preço?'),
    });

    expect(
      await runs.automationRuns.listByAutomation(TENANT, automations.rows[0]!.id, 10),
    ).toHaveLength(0);
    await app.close();
  });
});

describe('AU-06: o log conta o que aconteceu', () => {
  it('a execução aparece com o passo a passo', async () => {
    const { app } = await comMotor();
    const criada = await ligarAutomacao(app);
    await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: corpoDaEvolution('preço?'),
    });
    await app.inject({ method: 'POST', url: '/v1/automations/tick' });

    const lista = await app.inject({ method: 'GET', url: `/v1/automations/${criada.id}/runs` });
    const execucoes = lista.json() as { id: string; status: string }[];
    expect(execucoes[0]?.status).toBe('done');

    const detalhe = await app.inject({
      method: 'GET',
      url: `/v1/automation-runs/${execucoes[0]!.id}`,
    });
    const passos = (detalhe.json() as { steps: { nodeId: string; outcome: string }[] }).steps;
    expect(passos.map((s) => s.nodeId)).toEqual(['g1', 'c1', 'a1', 'f1']);
    expect(passos[1]?.outcome).toBe('true');
    await app.close();
  });

  /** O log guarda decisão sobre pessoa: as variáveis, com o dado do cliente, não saem no DTO. */
  it('o DTO da execução não expõe as variáveis', async () => {
    const { app } = await comMotor();
    const criada = await ligarAutomacao(app);
    await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: corpoDaEvolution('preço?'),
    });

    const lista = await app.inject({ method: 'GET', url: `/v1/automations/${criada.id}/runs` });

    expect(lista.json()[0]).not.toHaveProperty('variables');
    await app.close();
  });
});

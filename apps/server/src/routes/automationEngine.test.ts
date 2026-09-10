import { describe, expect, it, vi } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryServerDeps } from '../dev/inMemoryServerDeps.js';
import { inMemoryAutomations, inMemoryAutomationRuns } from '../dev/inMemoryAutomations.js';
import { inMemoryChannelIntegrations, inMemoryConversations } from '../dev/inMemoryMessaging.js';
import { inMemoryApiKeys } from '../dev/inMemoryIntake.js';
import type { ServerDeps } from '../buildServer.js';
import { CAMPOS_DO_GATILHO } from '@expedition/domain';
import type { TriggerType } from '@expedition/domain';
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

/**
 * O ASAAS de mentira, com o mínimo que a rota exercita: conectar, cotar e emitir. Não é o
 * fake da camada de aplicação porque ele mora do lado de lá da fronteira — e o que se testa
 * aqui é a borda, não o provedor.
 */
function gatewayDeTeste(): ServerDeps['paymentGateway'] {
  let seq = 0;
  return {
    checkAccount: () => Promise.resolve({ name: 'Drakkar Expedições' }),
    simulate: () => Promise.resolve({ percentBps: 0, fixedCents: 0 }),
    fetchSettlement: () => Promise.resolve(null),
    createCharge: () => {
      seq += 1;
      return Promise.resolve({
        externalId: `pay_${seq}`,
        installmentExternalId: null,
        invoiceUrl: null,
        status: 'PENDING',
      });
    },
  };
}

const TENANT = 'dev-tenant';

async function comMotor(paymentGateway?: ServerDeps['paymentGateway']) {
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
    apiKeys: inMemoryApiKeys([
      {
        keyId: 'k-intake',
        tenantId: TENANT,
        tenantSlug: 'dev',
        token: 'CHAVE-DE-INSCRICAO',
        scopes: ['intake:write'],
      },
      {
        keyId: 'k-auto',
        tenantId: TENANT,
        tenantSlug: 'dev',
        token: 'CHAVE-DE-AUTOMACAO',
        scopes: ['automation:trigger'],
      },
    ]),
    resolveContext: () => Promise.resolve(ctx),
  });
  // AU-03: o papel de quem liga a automação é relido a cada execução.
  await base.memberships.grant(TENANT, 'u-ana', 'ana@drakkar.com.br', 'owner');

  const deps: ServerDeps = {
    ...base,
    messagingGateway: { sendText: enviar, sendMedia: vi.fn() },
    ...(paymentGateway === undefined ? {} : { paymentGateway }),
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
      payload: { name: 'Responder preço' },
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

/**
 * AU-16 — o catálogo de campos é promessa, e promessa se cobra.
 *
 * O seletor da tela oferece `contato.nome`, `mensagem.texto` e os outros a partir de
 * `CAMPOS_DO_GATILHO`. Se a borda parar de mandar algum deles, a variável ausente vira vazio
 * em silêncio (AU-09, e é a regra certa) — a mensagem sai sem o nome do cliente e nada acusa.
 * Este teste é o que transforma esse silêncio em suíte vermelha.
 */
const temCaminho = (contexto: unknown, caminho: string): boolean => {
  let atual: unknown = contexto;
  for (const parte of caminho.split('.')) {
    if (atual === null || typeof atual !== 'object' || !(parte in atual)) return false;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return true;
};

/** Todo caminho que o seletor promete para este gatilho existe no contexto disparado. */
function cobraOCatalogo(variables: unknown, gatilho: TriggerType): void {
  for (const campo of CAMPOS_DO_GATILHO[gatilho]) {
    expect({ [campo.path]: temCaminho(variables, campo.path) }).toEqual({ [campo.path]: true });
  }
}

/** Uma automação ligada só no gatilho pedido: gatilho → fim, que é o mínimo que enfileira. */
async function ligarGatilho(
  app: Awaited<ReturnType<typeof comMotor>>['app'],
  trigger: TriggerType,
) {
  const criada = (
    await app.inject({ method: 'POST', url: '/v1/automations', payload: { name: trigger } })
  ).json() as { id: string };

  await app.inject({
    method: 'PUT',
    url: `/v1/automations/${criada.id}/graph`,
    payload: {
      graph: {
        nodes: [
          { id: 'g1', kind: 'trigger', type: trigger, config: {}, position: { x: 0, y: 0 } },
          { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 90 } },
        ],
        edges: [{ id: 'e1', from: 'g1', port: 'next', to: 'f1' }],
      },
    },
  });
  const ligou = await app.inject({
    method: 'PUT',
    url: `/v1/automations/${criada.id}/enabled`,
    payload: { enabled: true },
  });
  expect(ligou.statusCode).toBe(200);
  return criada;
}

describe('AU-16: o contexto disparado tem os campos que o seletor promete', () => {
  it('mensagem recebida entrega todos os campos do catálogo', async () => {
    const { app, runs, automations } = await comMotor();
    await ligarAutomacao(app);

    await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: corpoDaEvolution('quanto custa?'),
    });

    const [aberta] = await runs.automationRuns.listByAutomation(TENANT, automations.rows[0]!.id, 1);
    cobraOCatalogo(aberta?.variables, 'message_received');
    await app.close();
  });
});

/**
 * AU-04 — "conversa nova" existia na lista de gatilhos e não estava ligado em borda nenhuma.
 *
 * Um gatilho assim é pior que a falta dele: a equipe desenha o fluxo, liga, espera o efeito e
 * nada acontece — sem erro, sem log, sem nada para investigar. Com o gatilho virando bloco do
 * quadro (AU-14), ele passaria a ser oferecido na biblioteca, o que torna a dívida visível.
 */
describe('AU-04: conversa nova dispara no primeiro contato', () => {
  const soGatilho = (type: string) => ({
    nodes: [
      { id: 'g1', kind: 'trigger', type, config: {}, position: { x: 0, y: 0 } },
      { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 90 } },
    ],
    edges: [{ id: 'e1', from: 'g1', port: 'next', to: 'f1' }],
  });

  async function ligarConversaNova(app: Awaited<ReturnType<typeof comMotor>>['app']) {
    const criada = (
      await app.inject({
        method: 'POST',
        url: '/v1/automations',
        payload: { name: 'Dar boas-vindas' },
      })
    ).json() as { id: string };
    await app.inject({
      method: 'PUT',
      url: `/v1/automations/${criada.id}/graph`,
      payload: { graph: soGatilho('conversation_created') },
    });
    await app.inject({
      method: 'PUT',
      url: `/v1/automations/${criada.id}/enabled`,
      payload: { enabled: true },
    });
    return criada;
  }

  const mandar = (app: Awaited<ReturnType<typeof comMotor>>['app'], texto: string, id: string) =>
    app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: corpoDaEvolution(texto, id),
    });

  it('o primeiro contato de alguém abre execução', async () => {
    const { app, runs } = await comMotor();
    const criada = await ligarConversaNova(app);

    await mandar(app, 'oi, boa tarde', 'MSG-1');

    expect(await runs.automationRuns.listByAutomation(TENANT, criada.id, 10)).toHaveLength(1);
    await app.close();
  });

  /** Conversa nova é uma vez por pessoa. A segunda mensagem é mensagem, não contato novo. */
  it('a segunda mensagem da mesma pessoa não dispara de novo', async () => {
    const { app, runs } = await comMotor();
    const criada = await ligarConversaNova(app);

    await mandar(app, 'oi, boa tarde', 'MSG-1');
    await mandar(app, 'quanto custa?', 'MSG-2');

    expect(await runs.automationRuns.listByAutomation(TENANT, criada.id, 10)).toHaveLength(1);
    await app.close();
  });
});

/**
 * AU-17 — os gatilhos novos, cobrados na borda.
 *
 * O que nenhum teste de unidade alcança é justamente isto: que o gatilho esteja **ligado na
 * rota certa**. Um motor perfeito com o disparo faltando numa borda é uma automação que a
 * equipe liga e que nunca roda — e nada acusa, porque não há erro.
 */
describe('AU-17: mensagem enviada dispara na caixa, e o eco não', () => {
  async function ligarComGatilho(
    app: Awaited<ReturnType<typeof comMotor>>['app'],
    type: string,
    nome: string,
  ) {
    const criada = (
      await app.inject({ method: 'POST', url: '/v1/automations', payload: { name: nome } })
    ).json() as { id: string };
    await app.inject({
      method: 'PUT',
      url: `/v1/automations/${criada.id}/graph`,
      payload: {
        graph: {
          nodes: [
            { id: 'g1', kind: 'trigger', type, config: {}, position: { x: 0, y: 0 } },
            { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 90 } },
          ],
          edges: [{ id: 'e1', from: 'g1', port: 'next', to: 'f1' }],
        },
      },
    });
    await app.inject({
      method: 'PUT',
      url: `/v1/automations/${criada.id}/enabled`,
      payload: { enabled: true },
    });
    return criada;
  }

  it('responder pela caixa abre execução', async () => {
    const { app, runs } = await comMotor();
    const criada = await ligarComGatilho(app, 'message_sent', 'Marcar quem respondeu');
    // A conversa precisa existir: quem responde, responde a alguém.
    await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: corpoDaEvolution('oi', 'MSG-1'),
    });
    const lista = (await app.inject({ method: 'GET', url: '/v1/inbox/conversations' })).json() as {
      id: string;
    }[];

    const enviada = await app.inject({
      method: 'POST',
      url: `/v1/inbox/conversations/${lista[0]!.id}/messages`,
      payload: { body: 'o valor sai por 2.400' },
    });

    expect(enviada.statusCode).toBe(201);
    expect(await runs.automationRuns.listByAutomation(TENANT, criada.id, 10)).toHaveLength(1);
    await app.close();
  });

  /**
   * AU-05 — a proteção que faz o laço não existir, agora com um gatilho que a testa de frente:
   * o eco do provedor traz a mensagem que saiu, e ele **não** pode disparar "mensagem enviada".
   * Se disparasse, a resposta de uma automação alimentaria a próxima.
   */
  it('o eco do provedor não dispara mensagem enviada', async () => {
    const { app, runs } = await comMotor();
    const criada = await ligarComGatilho(app, 'message_sent', 'Marcar quem respondeu');

    await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: {
        event: 'messages.upsert',
        data: {
          key: { remoteJid: '5548999998877@s.whatsapp.net', fromMe: true, id: 'OUT-9' },
          message: { conversation: 'resposta que saiu do celular' },
          messageTimestamp: 1788000100,
        },
      },
    });

    expect(await runs.automationRuns.listByAutomation(TENANT, criada.id, 10)).toHaveLength(0);
    await app.close();
  });
});

/**
 * AU-21 — o gatilho de webhook: alguém de fora bate numa URL e o fluxo roda.
 *
 * Autentica pela **API key do tenant**, o mesmo desenho do webhook de inscrições (§5.7): chave
 * revogável na tela, escopo próprio, e 401 uniforme para slug desconhecido e chave errada — 403
 * confirmaria que aquele tenant existe, e isso é enumeração de clientes da plataforma.
 */
describe('AU-21: gatilho de webhook', () => {
  async function comGancho(app: Awaited<ReturnType<typeof comMotor>>['app'], nome: string) {
    const criada = (
      await app.inject({
        method: 'POST',
        url: '/v1/automations',
        payload: { name: `Gancho ${nome}` },
      })
    ).json() as { id: string };
    await app.inject({
      method: 'PUT',
      url: `/v1/automations/${criada.id}/graph`,
      payload: {
        graph: {
          nodes: [
            {
              id: 'g1',
              kind: 'trigger',
              type: 'webhook_received',
              config: { name: nome },
              position: { x: 0, y: 0 },
            },
            { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 90 } },
          ],
          edges: [{ id: 'e1', from: 'g1', port: 'next', to: 'f1' }],
        },
      },
    });
    await app.inject({
      method: 'PUT',
      url: `/v1/automations/${criada.id}/enabled`,
      payload: { enabled: true },
    });
    return criada;
  }

  it('a chamada com chave válida abre execução, com o corpo no contexto', async () => {
    const { app, runs } = await comMotor();
    const criada = await comGancho(app, 'site');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/automations/hooks/dev/site',
      headers: { api_token: 'CHAVE-DE-AUTOMACAO' },
      payload: { email: 'ana@exemplo.com', origem: 'landing' },
    });

    expect(res.statusCode).toBe(202);
    const [aberta] = await runs.automationRuns.listByAutomation(TENANT, criada.id, 5);
    expect(aberta?.variables).toMatchObject({
      webhook: { nome: 'site', corpo: { email: 'ana@exemplo.com' } },
    });
    await app.close();
  });

  it('sem chave, 401 — e nada roda', async () => {
    const { app, runs } = await comMotor();
    const criada = await comGancho(app, 'site');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/automations/hooks/dev/site',
      payload: { x: 1 },
    });

    expect(res.statusCode).toBe(401);
    expect(await runs.automationRuns.listByAutomation(TENANT, criada.id, 5)).toHaveLength(0);
    await app.close();
  });

  /** Cada gancho acorda o seu: a chamada do site não dispara o fluxo do parceiro. */
  it('o gancho de outro nome não é acordado', async () => {
    const { app, runs } = await comMotor();
    await comGancho(app, 'site');
    const parceiro = await comGancho(app, 'parceiro');

    await app.inject({
      method: 'POST',
      url: '/v1/automations/hooks/dev/site',
      headers: { api_token: 'CHAVE-DE-AUTOMACAO' },
      payload: {},
    });

    expect(await runs.automationRuns.listByAutomation(TENANT, parceiro.id, 5)).toHaveLength(0);
    await app.close();
  });
});

/**
 * AU-16 · AU-04 — os gatilhos de inscrição, que prometiam um id e agora prometem a inscrição.
 *
 * Enquanto o contexto era `{ inscricao: { id } }`, nenhuma automação conseguia escrever "seu
 * pagamento entrou, Ana": não havia nome, valor nem saída de onde tirar. Aqui a promessa do
 * seletor é cobrada contra a rota de verdade, um gatilho de cada vez.
 *
 * **Três dos caminhos abaixo não disparavam nada** — a inscrição vinda do portal, a confirmação
 * manual e o pagamento pelo gateway. Automação ligada neles simplesmente não acordava, sem erro
 * e sem log: o defeito mais caro que este módulo pode ter.
 */
describe('AU-16: os gatilhos de inscrição entregam o que o seletor promete', () => {
  const PRECOS = {
    validFrom: '2025-01-01',
    coupleCents: 200000,
    soloCents: 120000,
    extraAdultCents: 80000,
    childMidCents: 60000,
    childYoungCents: 40000,
  };

  /** Roteiro, saída e uma família — o cenário mínimo em que uma inscrição existe. */
  async function comSaida(app: Awaited<ReturnType<typeof comMotor>>['app']) {
    const itinerario = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Coxilha Rica', prices: PRECOS },
      })
    ).json() as { id: string };

    const evento = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: {
          itineraryId: itinerario.id,
          startDate: '2026-11-10',
          endDate: '2026-11-14',
        },
      })
    ).json() as { group: { id: string } };

    const cliente = (
      await app.inject({
        method: 'POST',
        url: '/v1/customers',
        payload: {
          fullName: 'Vanessa Santos',
          cpf: '90000010057',
          birthDate: '1989-01-14',
          email: 'vanessa@exemplo.com',
          phone: '48999998877',
        },
      })
    ).json() as { id: string };

    return { groupId: evento.group.id, customerId: cliente.id };
  }

  async function inscrever(
    app: Awaited<ReturnType<typeof comMotor>>['app'],
    groupId: string,
    customerId: string,
  ) {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/groups/${groupId}/bookings`,
      payload: { responsibleCustomerId: customerId, participantCustomerIds: [customerId] },
    });
    expect(res.statusCode).toBe(201);
    return (res.json() as { id: string }).id;
  }

  /**
   * A montagem do contexto roda **depois** da resposta HTTP — três leituras que não podem
   * segurar a borda (AU-04). Ler a execução direto passaria a depender de sorte de microtask.
   */
  async function execucaoDe(
    runs: Awaited<ReturnType<typeof comMotor>>['runs'],
    automationId: string,
  ) {
    return vi.waitFor(async () => {
      const abertas = await runs.automationRuns.listByAutomation(TENANT, automationId, 1);
      expect(abertas).toHaveLength(1);
      return abertas[0]!;
    });
  }

  it('inscrição criada entrega contato, saída e valores', async () => {
    const { app, runs } = await comMotor();
    const automacao = await ligarGatilho(app, 'booking_created');
    const { groupId, customerId } = await comSaida(app);

    await inscrever(app, groupId, customerId);

    const aberta = await execucaoDe(runs, automacao.id);
    cobraOCatalogo(aberta.variables, 'booking_created');
    expect(aberta.variables).toMatchObject({
      contato: { nome: 'Vanessa Santos', email: 'vanessa@exemplo.com' },
      inscricao: { status: 'pending', pessoas: 1, origem: 'manual', totalCents: 120000 },
      saida: { roteiro: 'Coxilha Rica', inicio: '2026-11-10', fim: '2026-11-14' },
    });
    await app.close();
  });

  it('recebimento entrega o pagamento e o saldo já descontado', async () => {
    const { app, runs } = await comMotor();
    const automacao = await ligarGatilho(app, 'payment_registered');
    const { groupId, customerId } = await comSaida(app);
    const bookingId = await inscrever(app, groupId, customerId);

    await app.inject({
      method: 'POST',
      url: `/v1/bookings/${bookingId}/payments`,
      payload: { amountCents: 50000, method: 'pix', paidAt: '2026-09-10' },
    });

    const aberta = await execucaoDe(runs, automacao.id);
    cobraOCatalogo(aberta.variables, 'payment_registered');
    expect(aberta.variables).toMatchObject({
      // O recebimento já entrou: é ler depois que faz "faltam {{dinheiro(saldoCents)}}" fechar.
      inscricao: { status: 'confirmed', recebidoCents: 50000, saldoCents: 70000 },
      pagamento: { valorCents: 50000, metodo: 'pix', data: '2026-09-10', confirmou: true },
    });
    await app.close();
  });

  it('o primeiro recebimento também confirma, e o gatilho de confirmação leva tudo', async () => {
    const { app, runs } = await comMotor();
    const automacao = await ligarGatilho(app, 'booking_confirmed');
    const { groupId, customerId } = await comSaida(app);
    const bookingId = await inscrever(app, groupId, customerId);

    await app.inject({
      method: 'POST',
      url: `/v1/bookings/${bookingId}/payments`,
      payload: { amountCents: 120000, method: 'pix', paidAt: '2026-09-10' },
    });

    const aberta = await execucaoDe(runs, automacao.id);
    cobraOCatalogo(aberta.variables, 'booking_confirmed');
    await app.close();
  });

  it('cancelamento leva o motivo junto do resto', async () => {
    const { app, runs } = await comMotor();
    const automacao = await ligarGatilho(app, 'booking_cancelled');
    const { groupId, customerId } = await comSaida(app);
    const bookingId = await inscrever(app, groupId, customerId);

    await app.inject({
      method: 'POST',
      url: `/v1/bookings/${bookingId}/cancel`,
      payload: { reason: 'desistiu da viagem' },
    });

    const aberta = await execucaoDe(runs, automacao.id);
    cobraOCatalogo(aberta.variables, 'booking_cancelled');
    expect(aberta.variables).toMatchObject({
      inscricao: { status: 'cancelled', motivo: 'desistiu da viagem' },
    });
    await app.close();
  });

  /**
   * **A confirmação manual não disparava nada.** Só o caminho do primeiro recebimento
   * disparava, então quem confirma pela mesa — o cliente que pagou por fora, o caso combinado —
   * deixava a automação de boas-vindas muda, sem nada que explicasse.
   */
  it('confirmar pela mesa dispara a confirmação', async () => {
    const { app, runs } = await comMotor();
    const automacao = await ligarGatilho(app, 'booking_confirmed');
    const { groupId, customerId } = await comSaida(app);
    const bookingId = await inscrever(app, groupId, customerId);

    const res = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${bookingId}/confirm`,
      payload: { note: 'pagou em dinheiro na saída anterior' },
    });
    expect(res.statusCode).toBe(200);

    const aberta = await execucaoDe(runs, automacao.id);
    cobraOCatalogo(aberta.variables, 'booking_confirmed');
    expect(aberta.variables).toMatchObject({ inscricao: { status: 'confirmed' } });
    await app.close();
  });
});

/**
 * AU-04 — a inscrição do portal também dispara.
 *
 * Era o caminho **mudo** que mais doía: só as duas alocações pela tela disparavam
 * `booking_created`, e quem se inscreve sozinho entra pela fila (§5.7.2). Uma automação de
 * boas-vindas ligada ficava calada justamente para a maioria — sem erro, sem log, sem nada
 * para investigar, que é o defeito mais caro que este módulo pode ter.
 */
describe('AU-04: inscrição vinda da fila dispara como as outras', () => {
  const PRECOS = {
    validFrom: '2025-01-01',
    coupleCents: 200000,
    soloCents: 120000,
    extraAdultCents: 80000,
    childMidCents: 60000,
    childYoungCents: 40000,
  };

  const doFormulario = () => ({
    entry_id: 9,
    form_id: 4641,
    submitted: '2026-08-11T18:57:17-03:00',
    fields: {
      resp_nome: { value: 'Vanessa Santos' },
      resp_cpf: { value: '900.000.100-57' },
      resp_email: { value: 'vanessa@exemplo.com' },
      resp_telefone: { value: '(48) 99999-8877' },
      resp_nascimento: { value: '1989-01-14' },
    },
  });

  it('alocar da fila entrega o contexto cheio', async () => {
    const { app, runs } = await comMotor();

    const automacao = (
      await app.inject({ method: 'POST', url: '/v1/automations', payload: { name: 'boas-vindas' } })
    ).json() as { id: string };
    await app.inject({
      method: 'PUT',
      url: `/v1/automations/${automacao.id}/graph`,
      payload: {
        graph: {
          nodes: [
            {
              id: 'g1',
              kind: 'trigger',
              type: 'booking_created',
              config: {},
              position: { x: 0, y: 0 },
            },
            { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 90 } },
          ],
          edges: [{ id: 'e1', from: 'g1', port: 'next', to: 'f1' }],
        },
      },
    });
    await app.inject({
      method: 'PUT',
      url: `/v1/automations/${automacao.id}/enabled`,
      payload: { enabled: true },
    });

    const itinerario = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Coxilha Rica', prices: PRECOS },
      })
    ).json() as { id: string };
    const evento = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId: itinerario.id, startDate: '2026-11-10', endDate: '2026-11-14' },
      })
    ).json() as { group: { id: string } };

    const recebido = (
      await app.inject({
        method: 'POST',
        url: '/v1/intake/dev',
        headers: { api_token: 'CHAVE-DE-INSCRICAO' },
        payload: doFormulario(),
      })
    ).json() as { intake_id: string };

    const alocou = await app.inject({
      method: 'POST',
      url: `/v1/intake/${recebido.intake_id}/allocate`,
      payload: { groupId: evento.group.id },
    });
    expect(alocou.statusCode).toBe(201);

    const [aberta] = await vi.waitFor(async () => {
      const abertas = await runs.automationRuns.listByAutomation(TENANT, automacao.id, 1);
      expect(abertas).toHaveLength(1);
      return abertas;
    });
    cobraOCatalogo(aberta?.variables, 'booking_created');
    expect(aberta?.variables).toMatchObject({
      contato: { nome: 'Vanessa Santos' },
      // A origem é o que separa quem se inscreveu sozinho de quem a equipe alocou.
      inscricao: { status: 'pending', origem: 'webhook' },
      saida: { roteiro: 'Coxilha Rica' },
    });
    await app.close();
  });
});

/**
 * AU-04 — pagar pelo link do ASAAS acorda a automação.
 *
 * Era o caminho em que o cliente paga **sozinho**, e o único que não disparava nada: o
 * recebimento entrava no ledger, a inscrição confirmava, e a automação de "recebemos seu
 * pagamento" ficava calada justamente onde ela mais serve.
 */
describe('AU-04: o webhook do gateway dispara pagamento e confirmação', () => {
  const PRECOS = {
    validFrom: '2025-01-01',
    coupleCents: 200000,
    soloCents: 120000,
    extraAdultCents: 80000,
    childMidCents: 60000,
    childYoungCents: 40000,
  };

  it('recebimento pelo ASAAS abre as duas execuções, com o contexto cheio', async () => {
    const { app, runs } = await comMotor(gatewayDeTeste());

    const pagamento = await ligarGatilho(app, 'payment_registered');
    const confirmacao = await ligarGatilho(app, 'booking_confirmed');

    const itinerario = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Coxilha Rica', prices: PRECOS },
      })
    ).json() as { id: string };
    const evento = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId: itinerario.id, startDate: '2026-11-10', endDate: '2026-11-14' },
      })
    ).json() as { group: { id: string } };
    const cliente = (
      await app.inject({
        method: 'POST',
        url: '/v1/customers',
        payload: {
          fullName: 'Vanessa Santos',
          cpf: '90000010057',
          birthDate: '1989-01-14',
          email: 'vanessa@exemplo.com',
          phone: '48999998877',
        },
      })
    ).json() as { id: string };
    const inscricao = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${evento.group.id}/bookings`,
        payload: { responsibleCustomerId: cliente.id, participantCustomerIds: [cliente.id] },
      })
    ).json() as { id: string };

    const conexao = (
      await app.inject({
        method: 'POST',
        url: '/v1/payment-integrations',
        payload: { environment: 'sandbox', accessToken: 'aact_teste' },
      })
    ).json() as { webhookToken: string };

    const cobranca = (
      await app.inject({
        method: 'POST',
        url: `/v1/bookings/${inscricao.id}/charges`,
        payload: {
          environment: 'sandbox',
          billingType: 'PIX',
          dueDate: '2026-09-30',
        },
      })
    ).json() as { externalId: string; amountCents: number };

    const recebeu = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/asaas/dev',
      headers: { 'asaas-access-token': conexao.webhookToken },
      payload: {
        event: 'PAYMENT_RECEIVED',
        payment: {
          id: cobranca.externalId,
          value: cobranca.amountCents / 100,
          billingType: 'PIX',
          status: 'RECEIVED',
          dueDate: '2026-09-30',
          paymentDate: '2026-09-12',
        },
      },
    });
    expect(recebeu.statusCode).toBe(200);

    const doPagamento = await vi.waitFor(async () => {
      const abertas = await runs.automationRuns.listByAutomation(TENANT, pagamento.id, 1);
      expect(abertas).toHaveLength(1);
      return abertas[0]!;
    });
    cobraOCatalogo(doPagamento.variables, 'payment_registered');
    expect(doPagamento.variables).toMatchObject({
      contato: { nome: 'Vanessa Santos' },
      // PG-08: o que quita é o líquido, e o saldo fecha com ele. O cliente pagou o bruto.
      inscricao: { status: 'confirmed', recebidoCents: 120000, saldoCents: 0 },
      pagamento: { metodo: 'pix', data: '2026-09-12', confirmou: true },
    });

    // IN-08: o mesmo dinheiro que entrou é o que confirmou — os dois gatilhos, uma leitura só.
    const daConfirmacao = await vi.waitFor(async () => {
      const abertas = await runs.automationRuns.listByAutomation(TENANT, confirmacao.id, 1);
      expect(abertas).toHaveLength(1);
      return abertas[0]!;
    });
    cobraOCatalogo(daConfirmacao.variables, 'booking_confirmed');
    await app.close();
  });
});

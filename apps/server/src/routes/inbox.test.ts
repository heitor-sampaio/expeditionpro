import { describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryServerDeps } from '../dev/inMemoryServerDeps.js';
import { inMemoryChannelIntegrations, inMemoryConversations } from '../dev/inMemoryMessaging.js';
import { inMemoryOpportunities } from '../dev/inMemoryOpportunities.js';
import type { RequestContext } from '@expedition/application';

const TENANT = 'dev-tenant';

function evento(id: string, texto: string) {
  return {
    event: 'messages.upsert',
    data: {
      key: { id, remoteJid: '5548999998877@s.whatsapp.net', fromMe: false },
      pushName: 'Ana Prado',
      message: { conversation: texto },
      messageTimestamp: 1788000000,
    },
  };
}

async function servidor(role: 'owner' | 'admin' | 'operator' | 'viewer' = 'owner') {
  const conversations = inMemoryConversations();
  const channelIntegrations = inMemoryChannelIntegrations([
    {
      tenantId: TENANT,
      id: 'ch-1',
      channel: 'whatsapp',
      provider: 'evolution',
      baseUrl: 'https://evo.local',
      externalAccountId: 'drakkar',
      accessToken: 'CHAVE',
      webhookToken: 'SEGREDO',
      active: true,
      connectedAt: new Date('2026-09-01T00:00:00Z'),
    },
  ]);
  const opportunities = inMemoryOpportunities([
    { tenantId: TENANT, id: 's-novo', name: 'Novo', position: 0, kind: 'open', archivedAt: null },
  ]);
  const ctx: RequestContext = { tenantId: TENANT, actor: { kind: 'team', userId: 'u1', role } };
  const app = await buildServer({
    logger: false,
    deps: inMemoryServerDeps({
      conversations,
      channelIntegrations,
      opportunities,
      resolveContext: () => Promise.resolve(ctx),
    }),
  });
  await app.ready();
  return { app, conversations, channelIntegrations, opportunities };
}

/**
 * AT-02 — o webhook é **público**: a Evolution não carrega JWT nenhum. Ele diz o tenant pela
 * URL e se prova pelo segredo no cabeçalho, exatamente como o do ASAAS (PG-03).
 */
describe('AT-02: POST /v1/webhooks/evolution/:tenantSlug', () => {
  it('recebe a mensagem e grava a conversa', async () => {
    const { app, conversations } = await servidor();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: evento('MSG-1', 'Quanto custa a Coxilha Rica?'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ handled: true });
    expect(conversations.messages).toHaveLength(1);
    await app.close();
  });

  it('token errado responde 401 sem tocar em nada', async () => {
    const { app, conversations } = await servidor();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'CHUTE' },
      payload: evento('MSG-1', 'oi'),
    });

    expect(res.statusCode).toBe(401);
    expect(conversations.messages).toHaveLength(0);
    await app.close();
  });

  it('slug desconhecido responde 401 igual a token errado — 403 confirmaria o tenant', async () => {
    const { app } = await servidor();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/nao-existe',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: evento('MSG-1', 'oi'),
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('AT-03: reenvio da mesma mensagem responde 200 e não duplica', async () => {
    const { app, conversations } = await servidor();
    const chamada = {
      method: 'POST' as const,
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: evento('MSG-1', 'oi'),
    };
    await app.inject(chamada);

    const res = await app.inject(chamada);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ handled: false });
    expect(conversations.messages).toHaveLength(1);
    await app.close();
  });
});

describe('AT-07: a caixa pelo HTTP', () => {
  async function comConversa(role: 'owner' | 'viewer' = 'owner') {
    const tudo = await servidor(role);
    await tudo.app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: evento('MSG-1', 'Quanto custa a Coxilha Rica?'),
    });
    return tudo;
  }

  it('lista as conversas com o resumo que a caixa mostra', async () => {
    const { app } = await comConversa();

    const res = await app.inject({ method: 'GET', url: '/v1/inbox/conversations' });

    expect(res.statusCode).toBe(200);
    const [primeira] = res.json();
    expect(primeira.displayName).toBe('Ana Prado');
    expect(primeira.channel).toBe('whatsapp');
    expect(primeira.unreadCount).toBe(1);
    await app.close();
  });

  it('abre o fio da conversa', async () => {
    const { app, conversations } = await comConversa();
    const id = conversations.conversations[0]!.id;

    const res = await app.inject({ method: 'GET', url: `/v1/inbox/conversations/${id}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().messages).toHaveLength(1);
    expect(res.json().messages[0].direction).toBe('in');
    await app.close();
  });

  it('conversa inexistente responde 404', async () => {
    const { app } = await servidor();

    const res = await app.inject({ method: 'GET', url: '/v1/inbox/conversations/nao-existe' });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('marcar como lida responde 204 e zera o não lido', async () => {
    const { app, conversations } = await comConversa();
    const id = conversations.conversations[0]!.id;

    const res = await app.inject({ method: 'POST', url: `/v1/inbox/conversations/${id}/read` });

    expect(res.statusCode).toBe(204);
    expect(conversations.conversations[0]!.unreadCount).toBe(0);
    await app.close();
  });

  it('AT-10: anexa a conversa a uma oportunidade', async () => {
    const { app, conversations, opportunities } = await comConversa();
    const id = conversations.conversations[0]!.id;
    const criada = await opportunities.createOpportunity({
      tenantId: TENANT,
      stageId: 's-novo',
      contactName: 'Ana Prado',
      phone: null,
      email: null,
      itineraryId: null,
      customerId: null,
      expectedValueCents: null,
      source: 'whatsapp',
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/inbox/conversations/${id}/opportunity`,
      payload: { opportunityId: criada.id },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().opportunityId).toBe(criada.id);
    await app.close();
  });

  it('viewer lê a caixa mas não marca como lida', async () => {
    const { app, conversations } = await comConversa('viewer');
    const id = conversations.conversations[0]!.id;

    const leitura = await app.inject({ method: 'GET', url: '/v1/inbox/conversations' });
    const escrita = await app.inject({ method: 'POST', url: `/v1/inbox/conversations/${id}/read` });

    expect(leitura.statusCode).toBe(200);
    expect(escrita.statusCode).toBe(403);
    await app.close();
  });
});

describe('AT-01: conexão de canal pelo HTTP', () => {
  it('conectar devolve o segredo uma vez, sem cache', async () => {
    const { app } = await servidor('owner');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/channel-integrations',
      payload: {
        channel: 'instagram',
        provider: 'meta',
        baseUrl: 'https://graph.facebook.com',
        externalAccountId: '17841400000000000',
        accessToken: 'TOKEN-DA-PAGINA',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(typeof res.json().webhookToken).toBe('string');
    await app.close();
  });

  it('a listagem nunca devolve a chave', async () => {
    const { app } = await servidor('operator');

    const res = await app.inject({ method: 'GET', url: '/v1/channel-integrations' });

    expect(res.statusCode).toBe(200);
    expect(res.payload).not.toContain('CHAVE');
    expect(res.json()[0].tokenPreview).toBe('••••HAVE');
    await app.close();
  });

  it('desconectar responde 204', async () => {
    const { app } = await servidor('owner');

    const res = await app.inject({ method: 'DELETE', url: '/v1/channel-integrations/whatsapp' });

    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it('canal fora da lista é recusado na borda', async () => {
    const { app } = await servidor('owner');

    const res = await app.inject({ method: 'DELETE', url: '/v1/channel-integrations/telegram' });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

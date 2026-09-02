import { describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryServerDeps } from '../dev/inMemoryServerDeps.js';
import {
  inMemoryChannelIntegrations,
  inMemoryConversations,
  inMemoryMessagingGateway,
} from '../dev/inMemoryMessaging.js';
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
  const messagingGateway = inMemoryMessagingGateway();
  const channelIntegrations = inMemoryChannelIntegrations([
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
      messagingGateway,
      opportunities,
      resolveContext: () => Promise.resolve(ctx),
    }),
  });
  await app.ready();
  return { app, conversations, channelIntegrations, opportunities, messagingGateway };
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

/**
 * AT-02 — o segredo também pode vir **no caminho**.
 *
 * Nem todo provedor deixa configurar cabeçalho no webhook: a Evolution instalada aqui só tem
 * campo de URL. Sem esta forma, a integração não existe para quem está nessa versão — e um
 * webhook público sem autenticação nenhuma não é alternativa.
 *
 * O preço é real e assumido: URL com segredo dentro passa por log de proxy, histórico de
 * navegador e print de tela. Daí o segredo do caminho ser o mesmo do cabeçalho, revogável
 * desconectando e conectando de novo, e apagado do nosso log pelo serializador (SEC-01).
 */
describe('AT-02: segredo no caminho, para provedor sem cabeçalho', () => {
  it('recebe a mensagem quando o segredo vem no caminho', async () => {
    const { app, conversations } = await servidor();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev/SEGREDO',
      payload: evento('MSG-1', 'Quanto custa a Coxilha Rica?'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ handled: true });
    expect(conversations.messages).toHaveLength(1);
    await app.close();
  });

  it('segredo errado no caminho responde 401 sem tocar em nada', async () => {
    const { app, conversations } = await servidor();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev/CHUTE',
      payload: evento('MSG-1', 'oi'),
    });

    expect(res.statusCode).toBe(401);
    expect(conversations.messages).toHaveLength(0);
    await app.close();
  });

  it('slug desconhecido com segredo certo responde 401 igual', async () => {
    const { app } = await servidor();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/nao-existe/SEGREDO',
      payload: evento('MSG-1', 'oi'),
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('AT-03: reenvio pelo caminho também não duplica', async () => {
    const { app, conversations } = await servidor();
    const chamada = {
      method: 'POST' as const,
      url: '/v1/webhooks/evolution/dev/SEGREDO',
      payload: evento('MSG-1', 'oi'),
    };
    await app.inject(chamada);

    const res = await app.inject(chamada);

    expect(res.json()).toEqual({ handled: false });
    expect(conversations.messages).toHaveLength(1);
    await app.close();
  });

  it('o cabeçalho continua valendo, e ganha do caminho quando os dois vêm', async () => {
    const { app, conversations } = await servidor();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev/CHUTE',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: evento('MSG-1', 'oi'),
    });

    expect(res.statusCode).toBe(200);
    expect(conversations.messages).toHaveLength(1);
    await app.close();
  });
});

/**
 * AT-02 — a cerca de origem, ligada pela rota de verdade.
 *
 * As peças foram escritas cada uma com seu teste — `ipIsAllowed`, `clientIp`,
 * `receiveChannelMessage`. O que se cobra aqui é a **ligação**: que a rota leia o endereço
 * pelo último salto e não pelo `request.ip`, que com `trustProxy` é escrito por quem chama.
 * Errar essa ligação deixaria a cerca aberta com as três peças verdes.
 */
describe('AT-02: cerca de origem pelo HTTP', () => {
  const DO_SERVIDOR = '69.62.88.81';

  async function comCerca() {
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
        allowedIps: [DO_SERVIDOR],
        webhookToken: 'SEGREDO',
        active: true,
        connectedAt: new Date('2026-09-01T00:00:00Z'),
      },
    ]);
    const ctx: RequestContext = {
      tenantId: TENANT,
      actor: { kind: 'team', userId: 'u1', role: 'owner' },
    };
    const app = await buildServer({
      logger: false,
      deps: inMemoryServerDeps({
        conversations,
        channelIntegrations,
        resolveContext: () => Promise.resolve(ctx),
      }),
    });
    await app.ready();
    return { app, conversations };
  }

  it('sem segredo nenhum, o endereço declarado entra', async () => {
    const { app, conversations } = await comCerca();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-forwarded-for': DO_SERVIDOR },
      payload: evento('MSG-1', 'oi'),
    });

    expect(res.statusCode).toBe(200);
    expect(conversations.messages).toHaveLength(1);
    await app.close();
  });

  /**
   * De onde vem a garantia de que este endereço não é forjado: **da borda**, não daqui.
   *
   * Medido em 2026-09-02 contra a API em produção — uma requisição enviada com
   * `x-forwarded-for: 203.0.113.77` chegou registrada com o IP real de quem chamou. A Railway
   * sobrescreve o cabeçalho em vez de acrescentar.
   *
   * Um teste não consegue provar isso: em `inject` não existe proxy nenhum, e o cabeçalho vale
   * o que o teste escrever. O que se cobra aqui é o lado de cá — que a cerca use o endereço que
   * o servidor resolveu. Trocar de hospedagem obriga a refazer a medida.
   */
  it('endereço de fora não entra', async () => {
    const { app, conversations } = await comCerca();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-forwarded-for': '203.0.113.9' },
      payload: evento('MSG-1', 'oi'),
    });

    expect(res.statusCode).toBe(401);
    expect(conversations.messages).toHaveLength(0);
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

/**
 * AT-02 · SEC — a recusa é **uma só** para quem chama, e **duas** para quem opera.
 *
 * Este teste nasceu de um webhook que chegava e voltava 401 sem ninguém saber por quê. Pelo
 * log era impossível separar "a Evolution não está mandando o cabeçalho" de "o segredo colado
 * lá é outro" — e são conserto diferente: um é configuração do provedor, o outro é reconectar.
 *
 * A resposta continua idêntica nos dois casos, porque a diferença enumeraria tenants (AT-02).
 * A diferença vive no log, que é nosso — e **sem o valor do segredo**, que não entra em log
 * nem quando ajudaria a depurar.
 */
describe('AT-02: a recusa do webhook é diagnosticável pelo log', () => {
  async function servidorComLog(role: 'owner' = 'owner') {
    const linhas: string[] = [];
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
        allowedIps: [],
        webhookToken: 'SEGREDO',
        active: true,
        connectedAt: new Date('2026-09-01T00:00:00Z'),
      },
    ]);
    const ctx: RequestContext = { tenantId: TENANT, actor: { kind: 'team', userId: 'u1', role } };
    const app = await buildServer({
      logStream: {
        write: (linha: string) => {
          linhas.push(linha);
        },
      },
      deps: inMemoryServerDeps({
        conversations,
        channelIntegrations,
        resolveContext: () => Promise.resolve(ctx),
      }),
    });
    await app.ready();
    return { app, linhas };
  }

  it('sem segredo nenhum, o log diz que não veio segredo', async () => {
    const { app, linhas } = await servidorComLog();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      payload: evento('MSG-1', 'oi'),
    });

    expect(res.statusCode).toBe(401);
    expect(linhas.join(' ')).toContain('sem_segredo');
    await app.close();
  });

  it('com cabeçalho e segredo errado, o log diz que o segredo não confere', async () => {
    const { app, linhas } = await servidorComLog();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'CHUTE-DE-QUEM-SONDA' },
      payload: evento('MSG-1', 'oi'),
    });

    expect(res.statusCode).toBe(401);
    expect(linhas.join(' ')).toContain('token_nao_confere');
    await app.close();
  });

  it('o segredo apresentado nunca aparece no log', async () => {
    const { app, linhas } = await servidorComLog();

    await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/dev',
      headers: { 'x-webhook-token': 'CHUTE-DE-QUEM-SONDA' },
      payload: evento('MSG-1', 'oi'),
    });

    expect(linhas.join(' ')).not.toContain('CHUTE-DE-QUEM-SONDA');
    await app.close();
  });

  it('slug desconhecido também é registrado, e responde igual', async () => {
    const { app, linhas } = await servidorComLog();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/evolution/nao-existe',
      headers: { 'x-webhook-token': 'SEGREDO' },
      payload: evento('MSG-1', 'oi'),
    });

    expect(res.statusCode).toBe(401);
    expect(linhas.join(' ')).toContain('slug_desconhecido');
    await app.close();
  });
});

/**
 * AT-08 — responder pela caixa, pelo HTTP.
 *
 * A regra que importa mora no caso de uso e está testada lá. Aqui se cobra a borda: que a
 * recusa do provedor **não** volte como 500 anônimo, e que o motivo dele chegue à tela — é a
 * diferença entre "não deu" e "o número não existe no WhatsApp".
 */
describe('AT-08: POST /v1/inbox/conversations/:id/messages', () => {
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

  it('envia e devolve a mensagem gravada', async () => {
    const { app, conversations } = await comConversa();
    const id = conversations.conversations[0]!.id;

    const res = await app.inject({
      method: 'POST',
      url: `/v1/inbox/conversations/${id}/messages`,
      payload: { body: 'Bom dia! Vou te passar os valores.' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      direction: 'out',
      body: 'Bom dia! Vou te passar os valores.',
    });
    await app.close();
  });

  // Só espaço passa pelo `min(1)` do Zod e cai no caso de uso, que responde 422 como toda
  // validação de campo obrigatório neste projeto.
  it('mensagem só com espaço é recusada', async () => {
    const { app, conversations } = await comConversa();
    const id = conversations.conversations[0]!.id;

    const res = await app.inject({
      method: 'POST',
      url: `/v1/inbox/conversations/${id}/messages`,
      payload: { body: '   ' },
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('viewer não responde', async () => {
    const { app, conversations } = await comConversa('viewer');
    const id = conversations.conversations[0]!.id;

    const res = await app.inject({
      method: 'POST',
      url: `/v1/inbox/conversations/${id}/messages`,
      payload: { body: 'oi' },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('recusa do provedor volta como 502, com o motivo dele', async () => {
    const { app, conversations, messagingGateway } = await comConversa();
    const id = conversations.conversations[0]!.id;
    messagingGateway.falharCom('number not exists on whatsapp');

    const res = await app.inject({
      method: 'POST',
      url: `/v1/inbox/conversations/${id}/messages`,
      payload: { body: 'oi' },
    });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      error: 'send_failed',
      detail: 'number not exists on whatsapp',
    });
    expect(conversations.messages).toHaveLength(1);
    await app.close();
  });

  it('canal desconectado diz isso, e não vira 500', async () => {
    const { app, conversations, channelIntegrations } = await comConversa();
    const id = conversations.conversations[0]!.id;
    await channelIntegrations.remove(TENANT, 'whatsapp');

    const res = await app.inject({
      method: 'POST',
      url: `/v1/inbox/conversations/${id}/messages`,
      payload: { body: 'oi' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'channel_not_connected' });
    await app.close();
  });
});

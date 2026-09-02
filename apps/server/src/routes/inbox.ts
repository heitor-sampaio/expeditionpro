import {
  attachConversationToOpportunity,
  connectChannel,
  disconnectChannel,
  getConversation,
  listChannelIntegrations,
  listConversations,
  markConversationRead,
  receiveChannelMessage,
} from '@expedition/application';
import { UnauthorizedError } from '@expedition/application';
import { z } from 'zod';
import type {
  ChannelIntegrationView,
  ConversationRecord,
  MessageRecord,
} from '@expedition/application';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * §5.17 — a caixa de conversas e a conexão dos canais.
 *
 * O webhook é a única rota pública daqui, e é pública por natureza: nenhum provedor de
 * mensagem carrega o JWT do tenant. Ele diz de quem é pela URL e se prova pelo segredo no
 * cabeçalho — o mesmo desenho do webhook do ASAAS (PG-03), com as mesmas três consequências:
 * 401 uniforme para slug desconhecido e token errado, rate limit pela chave apresentada, e
 * 200 para o que foi ignorado, porque erro faria o provedor reenviar em laço.
 */

const channel = z.enum(['whatsapp', 'instagram', 'messenger']);

/** Cabeçalho do segredo. Nome próprio nosso: a Evolution deixa o cabeçalho a nosso critério. */
const WEBHOOK_HEADER = 'x-webhook-token';

export function registerInboxRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  const inbox = () => ({ conversations: deps.conversations });

  // AT-02 — webhook da Evolution. Público, autenticado pelo segredo no cabeçalho.
  typed.post(
    '/v1/webhooks/evolution/:tenantSlug',
    {
      schema: { params: z.object({ tenantSlug: z.string().min(1) }) },
      config: {
        rateLimit: {
          max: 600,
          timeWindow: '1 minute',
          keyGenerator: (request) =>
            (request.headers[WEBHOOK_HEADER] as string | undefined) ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      /*
       * A recusa é **uma só** para quem chama e **duas** para quem opera.
       *
       * Quem chama recebe sempre o mesmo 401: a diferença entre "este tenant não existe" e
       * "o segredo está errado" enumeraria os clientes da plataforma, um chute por vez.
       *
       * Quem opera precisa do contrário. "A Evolution não manda o cabeçalho" e "o segredo
       * colado lá é outro" têm conserto diferente — configuração do provedor num caso,
       * reconectar no outro — e sem essa distinção o diagnóstico vira adivinhação. Ela fica
       * no log, que é nosso, e **sem o valor apresentado**: segredo não entra em log nem
       * quando ajudaria a depurar.
       */
      const recusar = (motivo: string) => {
        request.log.warn(
          { motivo, tenantSlug: request.params.tenantSlug },
          'webhook evolution recusado',
        );
        return reply.status(401).send({ error: 'unauthorized' });
      };

      const tenantId = await deps.tenants.findIdBySlug(request.params.tenantSlug);
      if (!tenantId) return recusar('slug_desconhecido');

      const cabecalho = request.headers[WEBHOOK_HEADER];
      const token = typeof cabecalho === 'string' ? cabecalho : '';
      if (token === '') return recusar('sem_cabecalho');

      try {
        const outcome = await receiveChannelMessage(
          {
            integrations: deps.channelIntegrations,
            conversations: deps.conversations,
            customers: deps.customers,
          },
          { tenantId, actor: { kind: 'system' } },
          { token, body: request.body },
        );
        return reply.send({ handled: outcome.handled });
      } catch (error) {
        // Só o caso de segredo errado ganha linha própria; o resto segue para o tratador
        // global, que já sabe traduzir erro de negócio e falha inesperada.
        if (error instanceof UnauthorizedError) return recusar('token_nao_confere');
        throw error;
      }
    },
  );

  typed.get('/v1/inbox/conversations', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const rows = await listConversations(inbox(), ctx);
    return reply.send(rows.map(conversationDto));
  });

  typed.get(
    '/v1/inbox/conversations/:conversationId',
    { schema: { params: z.object({ conversationId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const fio = await getConversation(inbox(), ctx, {
        conversationId: request.params.conversationId,
      });
      return reply.send({
        conversation: conversationDto(fio.conversation),
        messages: fio.messages.map(messageDto),
      });
    },
  );

  typed.post(
    '/v1/inbox/conversations/:conversationId/read',
    { schema: { params: z.object({ conversationId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await markConversationRead(inbox(), ctx, {
        conversationId: request.params.conversationId,
      });
      return reply.status(204).send();
    },
  );

  // AT-10 — a ponte com o funil. `null` desanexa.
  typed.patch(
    '/v1/inbox/conversations/:conversationId/opportunity',
    {
      schema: {
        params: z.object({ conversationId: z.string().min(1) }),
        body: z.object({ opportunityId: z.string().min(1).nullable() }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const atualizada = await attachConversationToOpportunity(
        {
          conversations: deps.conversations,
          opportunities: deps.opportunities,
          audit: deps.audit,
        },
        ctx,
        {
          conversationId: request.params.conversationId,
          opportunityId: request.body.opportunityId,
        },
      );
      return reply.send(conversationDto(atualizada));
    },
  );

  typed.get('/v1/channel-integrations', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const rows = await listChannelIntegrations({ integrations: deps.channelIntegrations }, ctx);
    return reply.send(rows.map(integrationDto));
  });

  typed.post(
    '/v1/channel-integrations',
    {
      schema: {
        body: z.object({
          channel,
          provider: z.enum(['evolution', 'meta']),
          baseUrl: z.string().trim().min(1),
          externalAccountId: z.string().trim().min(1),
          accessToken: z.string().trim().min(1),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const conectado = await connectChannel(
        {
          integrations: deps.channelIntegrations,
          audit: deps.audit,
          newSecret: deps.newWebhookSecret,
        },
        ctx,
        request.body,
      );
      // O segredo sai **uma vez**, aqui: é o que a equipe cola no painel do provedor. A
      // listagem nunca o devolve — no banco só existe o hash. `no-store` porque credencial em
      // corpo de resposta não pode ficar em cache de proxy, de CDN ou do navegador.
      return reply
        .status(201)
        .header('cache-control', 'no-store')
        .send({ ...integrationDto(conectado), webhookToken: conectado.webhookToken });
    },
  );

  typed.delete(
    '/v1/channel-integrations/:channel',
    { schema: { params: z.object({ channel }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await disconnectChannel({ integrations: deps.channelIntegrations, audit: deps.audit }, ctx, {
        channel: request.params.channel,
      });
      return reply.status(204).send();
    },
  );
}

/** O que a caixa mostra de uma conversa. Datas em ISO, como todo DTO daqui. */
function conversationDto(conversation: ConversationRecord) {
  return {
    id: conversation.id,
    channel: conversation.channel,
    channelUserId: conversation.channelUserId,
    displayName: conversation.displayName,
    customerId: conversation.customerId,
    opportunityId: conversation.opportunityId,
    lastMessageAt: conversation.lastMessageAt ? conversation.lastMessageAt.toISOString() : null,
    unreadCount: conversation.unreadCount,
  };
}

/**
 * A mensagem, sem o `payload` cru.
 *
 * O corpo do webhook fica na tabela como registro (AT-04), do mesmo jeito que `intake_events`,
 * mas não sai pela API: tem metadado do provedor, id de aparelho e campos que mudam a cada
 * versão da Evolution. A tela precisa do texto, de quem mandou e de quando.
 */
function messageDto(message: MessageRecord) {
  return {
    id: message.id,
    direction: message.direction,
    body: message.body,
    sentByUserId: message.sentByUserId,
    sentAt: message.sentAt.toISOString(),
  };
}

/** A tela vê canal, provedor, conta e desde quando — nunca a chave. */
function integrationDto(integration: ChannelIntegrationView) {
  return {
    channel: integration.channel,
    provider: integration.provider,
    baseUrl: integration.baseUrl,
    externalAccountId: integration.externalAccountId,
    tokenPreview: integration.tokenPreview,
    active: integration.active,
    connectedAt: integration.connectedAt.toISOString(),
  };
}

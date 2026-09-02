import {
  attachConversationToOpportunity,
  connectChannel,
  disconnectChannel,
  getConversation,
  listChannelIntegrations,
  listConversations,
  markConversationRead,
  receiveChannelMessage,
  sendChannelMessage,
} from '@expedition/application';
import { BusinessRuleError, UnauthorizedError } from '@expedition/application';
import { z } from 'zod';
import type {
  ChannelIntegrationView,
  ConversationRecord,
  MessageRecord,
} from '@expedition/application';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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

  /*
   * AT-02 — webhook da Evolution. Público, autenticado pelo segredo.
   *
   * Duas formas de apresentar o mesmo segredo, e o provedor escolhe pela que conseguir:
   *
   * - **cabeçalho** `x-webhook-token`, que é o certo — segredo em cabeçalho não passa por log
   *   de proxy, histórico nem print de tela;
   * - **último segmento do caminho**, para quem não tem campo de cabeçalho nenhum. A Evolution
   *   instalada aqui é desse tipo, e sem esta forma a integração simplesmente não existe para
   *   quem está nessa versão.
   *
   * O preço da segunda é real e assumido: a URL inteira vira credencial, e credencial em URL
   * vaza pelos lugares acima. Por isso ela é a mesma coisa revogável do cabeçalho — desconectar
   * e conectar gera outra — e sai apagada do nosso log pelo serializador (SEC-01).
   */
  const rotaWebhook = {
    max: 600,
    timeWindow: '1 minute',
  };

  typed.post(
    '/v1/webhooks/evolution/:tenantSlug/:token',
    {
      schema: {
        params: z.object({ tenantSlug: z.string().min(1), token: z.string().min(1) }),
      },
      config: { rateLimit: { ...rotaWebhook, keyGenerator: chaveDoLimite } },
    },
    (request, reply) => receber(request, reply, request.params.tenantSlug, request.params.token),
  );

  typed.post(
    '/v1/webhooks/evolution/:tenantSlug',
    {
      schema: { params: z.object({ tenantSlug: z.string().min(1) }) },
      config: { rateLimit: { ...rotaWebhook, keyGenerator: chaveDoLimite } },
    },
    (request, reply) => receber(request, reply, request.params.tenantSlug, ''),
  );

  /** Um balde por segredo apresentado; sem segredo, por IP. */
  function chaveDoLimite(request: FastifyRequest): string {
    const cabecalho = request.headers[WEBHOOK_HEADER];
    if (typeof cabecalho === 'string' && cabecalho !== '') return cabecalho;
    const { token } = (request.params ?? {}) as { token?: string };
    return token ?? request.ip;
  }

  async function receber(
    request: FastifyRequest,
    reply: FastifyReply,
    tenantSlug: string,
    tokenDoCaminho: string,
  ) {
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
      request.log.warn({ motivo, tenantSlug }, 'webhook evolution recusado');
      return reply.status(401).send({ error: 'unauthorized' });
    };

    const tenantId = await deps.tenants.findIdBySlug(tenantSlug);
    if (!tenantId) return recusar('slug_desconhecido');

    // O cabeçalho ganha do caminho: quem conseguiu configurá-lo está na forma boa, e é ela
    // que vale mesmo que a URL antiga com segredo ainda esteja cadastrada em algum lugar.
    const cabecalho = request.headers[WEBHOOK_HEADER];
    const token = typeof cabecalho === 'string' && cabecalho !== '' ? cabecalho : tokenDoCaminho;

    try {
      const outcome = await receiveChannelMessage(
        {
          integrations: deps.channelIntegrations,
          conversations: deps.conversations,
          customers: deps.customers,
        },
        { tenantId, actor: { kind: 'system' } },
        {
          token,
          /*
           * AT-02 — o endereço que o proxy resolveu.
           *
           * A pergunta é se dá para forjar isto. **Medido em 2026-09-02**, não: uma requisição
           * enviada com `x-forwarded-for: 203.0.113.77` chegou registrada com o IP real de
           * quem chamou. A borda da Railway sobrescreve o cabeçalho em vez de acrescentar,
           * então o valor aqui é dela, não de quem bateu na porta.
           *
           * **A cerca depende disso.** Se um dia o sistema sair da Railway, ou ela mudar esse
           * comportamento, o endereço volta a ser texto de quem chama e a cerca abre sozinha.
           * A medida é refazível: mande a mesma requisição com o cabeçalho forjado e confira
           * no log qual endereço apareceu.
           */
          clientIp: request.ip,
          channel: 'whatsapp',
          body: request.body,
        },
      );
      return reply.send({ handled: outcome.handled });
    } catch (error) {
      // Só o caso de segredo errado ganha linha própria; o resto segue para o tratador
      // global, que já sabe traduzir erro de negócio e falha inesperada.
      if (error instanceof UnauthorizedError) {
        // Sem segredo apresentado, quem recusou foi a cerca de origem — outro conserto.
        return recusar(token === '' ? 'sem_segredo_e_origem_recusada' : 'token_nao_confere');
      }
      throw error;
    }
  }

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

  /*
   * AT-08 — responder pela caixa.
   *
   * 502 e não 500 quando o provedor recusa: a falha é de lá, e o motivo dele sobe junto no
   * corpo. É o que faz a tela dizer "o número não existe no WhatsApp" em vez de "não deu" —
   * a diferença entre corrigir o contato e sair procurando o que houve.
   */
  typed.post(
    '/v1/inbox/conversations/:conversationId/messages',
    {
      schema: {
        params: z.object({ conversationId: z.string().min(1) }),
        body: z.object({ body: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      try {
        const enviada = await sendChannelMessage(
          {
            conversations: deps.conversations,
            integrations: deps.channelIntegrations,
            gateway: deps.messagingGateway,
            clock: deps.clock ?? (() => new Date()),
          },
          ctx,
          { conversationId: request.params.conversationId, body: request.body.body },
        );
        return reply.status(201).send(messageDto(enviada));
      } catch (error) {
        if (error instanceof BusinessRuleError && error.code === 'send_failed') {
          return reply.status(502).send({ error: error.code, detail: error.message });
        }
        throw error;
      }
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
          // AT-02: a forma de cada endereço é conferida no caso de uso, que é onde a regra
          // mora — aqui só se garante que é uma lista de texto.
          allowedIps: z.array(z.string()).optional(),
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
    phone: conversation.phone,
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
    allowedIps: integration.allowedIps,
    active: integration.active,
    connectedAt: integration.connectedAt.toISOString(),
  };
}

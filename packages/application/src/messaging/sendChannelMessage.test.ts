import { describe, expect, it } from 'vitest';
import { fakeChannelIntegrationRepository } from './channelIntegrationRepository.fake.js';
import { fakeConversationRepository } from './conversationRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeMessagingGateway } from './messagingGateway.fake.js';
import { receiveChannelMessage } from './receiveChannelMessage.js';
import { sendChannelMessage } from './sendChannelMessage.js';
import { BusinessRuleError, ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';

function ctxCom(role: 'owner' | 'operator' | 'viewer'): RequestContext {
  return { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u-ana', role } };
}

const cliente: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u-cli', customerId: 'c1' },
};

const INTEGRACAO = {
  tenantId: 'tenant-a',
  id: 'ch-1',
  channel: 'whatsapp' as const,
  provider: 'evolution' as const,
  baseUrl: 'https://evo.local',
  externalAccountId: 'drakkar',
  accessToken: 'CHAVE',
  allowedIps: [],
  webhookToken: 'SEGREDO',
  active: true,
  connectedAt: new Date('2026-09-01T00:00:00Z'),
};

async function cenario(comCanal = true) {
  const conversations = fakeConversationRepository();
  const conversa = await conversations.createConversation({
    tenantId: 'tenant-a',
    channel: 'whatsapp',
    channelUserId: '5548999998877',
    displayName: 'Ana Prado',
    customerId: null,
  });
  const integrations = fakeChannelIntegrationRepository(comCanal ? [INTEGRACAO] : []);
  const gateway = fakeMessagingGateway();
  const clock = () => new Date('2026-09-03T14:00:00Z');
  return { conversations, integrations, gateway, clock, conversa };
}

/**
 * AT-08 — responder pela tela.
 *
 * O que a caixa compartilhada troca pela atribuição é **o registro de quem respondeu**: sem
 * dono da conversa, saber quem falou com o cliente é o que sobra de rastro. Por isso
 * `sentByUserId` é gravado em toda mensagem que sai, e por isso enviar exige writer.
 */
describe('AT-08: enviar mensagem pela caixa', () => {
  it('manda pelo provedor e grava a mensagem como saída', async () => {
    const d = await cenario();

    const enviada = await sendChannelMessage(d, ctxCom('operator'), {
      conversationId: d.conversa.id,
      body: 'Bom dia! Vou te passar os valores.',
    });

    expect(d.gateway.enviadas).toEqual([
      { to: '5548999998877', text: 'Bom dia! Vou te passar os valores.', instancia: 'drakkar' },
    ]);
    expect(enviada.direction).toBe('out');
    expect(enviada.body).toBe('Bom dia! Vou te passar os valores.');
  });

  it('grava quem respondeu — é o que a caixa compartilhada tem no lugar do dono', async () => {
    const d = await cenario();

    const enviada = await sendChannelMessage(d, ctxCom('operator'), {
      conversationId: d.conversa.id,
      body: 'oi',
    });

    expect(enviada.sentByUserId).toBe('u-ana');
  });

  it('a conversa sobe na lista, e o que sai não conta como não lido', async () => {
    const d = await cenario();

    await sendChannelMessage(d, ctxCom('operator'), {
      conversationId: d.conversa.id,
      body: 'oi',
    });

    const atual = await d.conversations.findConversationById('tenant-a', d.conversa.id);
    expect(atual?.lastMessageAt).toEqual(new Date('2026-09-03T14:00:00Z'));
    expect(atual?.unreadCount).toBe(0);
  });

  it('guarda o id do provedor — é ele que impede o eco de virar mensagem repetida', async () => {
    const d = await cenario();

    const enviada = await sendChannelMessage(d, ctxCom('operator'), {
      conversationId: d.conversa.id,
      body: 'oi',
    });

    expect(enviada.externalId).toBe('EVO-1');
  });

  /**
   * AT-03 — o provedor devolve pelo webhook a mensagem que nós mesmos mandamos, com o mesmo
   * id. Sem a checagem por `externalId`, cada resposta da equipe apareceria duas vezes no fio.
   */
  it('AT-03: o eco da própria mensagem não duplica o fio', async () => {
    const d = await cenario();
    const enviada = await sendChannelMessage(d, ctxCom('operator'), {
      conversationId: d.conversa.id,
      body: 'oi',
    });

    const eco = await receiveChannelMessage(
      { ...d, customers: fakeCustomerRepository() },
      { tenantId: 'tenant-a', actor: { kind: 'system' } },
      {
        token: 'SEGREDO',
        clientIp: '',
        channel: 'whatsapp',
        body: {
          event: 'messages.upsert',
          data: {
            key: {
              id: enviada.externalId,
              remoteJid: '5548999998877@s.whatsapp.net',
              fromMe: true,
            },
            message: { conversation: 'oi' },
            messageTimestamp: 1788000000,
          },
        },
      },
    );

    expect(eco.handled).toBe(false);
    expect(d.conversations.messages).toHaveLength(1);
  });

  it('viewer não responde — somente leitura vale também para o que sai', async () => {
    const d = await cenario();

    await expect(
      sendChannelMessage(d, ctxCom('viewer'), { conversationId: d.conversa.id, body: 'oi' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não responde pela caixa — o portal não tem chat (AT-11)', async () => {
    const d = await cenario();

    await expect(
      sendChannelMessage(d, cliente, { conversationId: d.conversa.id, body: 'oi' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('mensagem vazia é recusada antes de chamar o provedor', async () => {
    const d = await cenario();

    await expect(
      sendChannelMessage(d, ctxCom('operator'), { conversationId: d.conversa.id, body: '   ' }),
    ).rejects.toBeInstanceOf(RequiredFieldError);
    expect(d.gateway.enviadas).toHaveLength(0);
  });

  it('conversa de outro tenant responde como se não existisse', async () => {
    const d = await cenario();

    await expect(
      sendChannelMessage(
        d,
        { ...ctxCom('operator'), tenantId: 'tenant-b' },
        {
          conversationId: d.conversa.id,
          body: 'oi',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('canal desconectado diz isso, em vez de falhar sem explicação', async () => {
    const d = await cenario(false);

    await expect(
      sendChannelMessage(d, ctxCom('operator'), { conversationId: d.conversa.id, body: 'oi' }),
    ).rejects.toMatchObject({ code: 'channel_not_connected' });
  });

  /**
   * O provedor recusou: a mensagem **não** entra no fio. Gravar mesmo assim mostraria à equipe
   * uma resposta que o cliente nunca recebeu — o pior erro possível numa caixa de atendimento.
   */
  it('falha no provedor não deixa mensagem fantasma no fio', async () => {
    const d = await cenario();
    d.gateway.falharCom('número não existe no WhatsApp');

    await expect(
      sendChannelMessage(d, ctxCom('operator'), { conversationId: d.conversa.id, body: 'oi' }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(d.conversations.messages).toHaveLength(0);
  });

  it('o motivo do provedor chega junto — é o que permite consertar', async () => {
    const d = await cenario();
    d.gateway.falharCom('número não existe no WhatsApp');

    await expect(
      sendChannelMessage(d, ctxCom('operator'), { conversationId: d.conversa.id, body: 'oi' }),
    ).rejects.toThrow(/número não existe no WhatsApp/);
  });
});

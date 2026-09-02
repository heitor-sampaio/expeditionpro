import { describe, expect, it } from 'vitest';
import { fakeConversationRepository } from './conversationRepository.fake.js';
import { fakeMediaStore } from './mediaStore.fake.js';
import { fakeOpportunityRepository } from '../crm/opportunityRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { listConversations } from './listConversations.js';
import { getConversation } from './getConversation.js';
import { markConversationRead } from './markConversationRead.js';
import { attachConversationToOpportunity } from './attachConversationToOpportunity.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

function ctxCom(role: 'owner' | 'operator' | 'viewer'): RequestContext {
  return { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u1', role } };
}

const cliente: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u-cli', customerId: 'c1' },
};

async function comConversa() {
  const conversations = fakeConversationRepository();
  const media = fakeMediaStore();
  const conversa = await conversations.createConversation({
    tenantId: 'tenant-a',
    channel: 'whatsapp',
    channelUserId: '5548999998877',
    phone: '5548999998877',
    displayName: 'Ana Prado',
    customerId: null,
  });
  await conversations.addMessage({
    tenantId: 'tenant-a',
    conversationId: conversa.id,
    externalId: 'MSG-1',
    direction: 'in',
    body: 'Quanto custa a Coxilha Rica?',
    sentByUserId: null,
    media: null,
    payload: {},
    sentAt: new Date('2026-09-01T10:00:00Z'),
  });
  await conversations.touchConversation('tenant-a', conversa.id, {
    at: new Date('2026-09-01T10:00:00Z'),
    direction: 'in',
  });
  return { conversations, media, conversa };
}

/**
 * AT-07 — a caixa é **compartilhada**: toda a equipe vê e responde qualquer conversa.
 *
 * É como uma operação pequena funciona de verdade. Conversa parada porque o dono dela está
 * na estrada é pior que conversa sem dono; o que a caixa compartilhada troca pela atribuição
 * é o registro de quem respondeu, que fica em cada mensagem (AT-08).
 */
describe('AT-07: ler a caixa', () => {
  it('lista as conversas do tenant', async () => {
    const { conversations } = await comConversa();

    const lista = await listConversations({ conversations }, ctxCom('operator'));

    expect(lista.map((c) => c.displayName)).toEqual(['Ana Prado']);
  });

  it('viewer lê a caixa — somente leitura não é cegueira', async () => {
    const { conversations } = await comConversa();

    expect(await listConversations({ conversations }, ctxCom('viewer'))).toHaveLength(1);
  });

  it('cliente não lê a caixa — o portal não tem chat (AT-11)', async () => {
    const { conversations } = await comConversa();

    await expect(listConversations({ conversations }, cliente)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('abrir uma conversa traz o fio inteiro, em ordem', async () => {
    const { conversations, media, conversa } = await comConversa();
    await conversations.addMessage({
      tenantId: 'tenant-a',
      conversationId: conversa.id,
      externalId: 'MSG-2',
      direction: 'out',
      body: 'Bom dia! Vou te passar os valores.',
      sentByUserId: 'u1',
      media: null,
      payload: {},
      sentAt: new Date('2026-09-01T10:05:00Z'),
    });

    const fio = await getConversation({ conversations, media }, ctxCom('operator'), {
      conversationId: conversa.id,
    });

    expect(fio.messages.map((m) => m.body)).toEqual([
      'Quanto custa a Coxilha Rica?',
      'Bom dia! Vou te passar os valores.',
    ]);
    expect(fio.conversation.displayName).toBe('Ana Prado');
  });

  it('conversa de outro tenant responde como se não existisse', async () => {
    const { conversations, media, conversa } = await comConversa();

    await expect(
      getConversation(
        { conversations, media },
        { ...ctxCom('operator'), tenantId: 'tenant-b' },
        {
          conversationId: conversa.id,
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('AT-07: marcar como lida', () => {
  it('zera o não lido', async () => {
    const { conversations, conversa } = await comConversa();

    await markConversationRead({ conversations }, ctxCom('operator'), {
      conversationId: conversa.id,
    });

    const atual = await conversations.findConversationById('tenant-a', conversa.id);
    expect(atual?.unreadCount).toBe(0);
  });

  it('viewer não marca como lida — esconderia o não lido de quem vai responder', async () => {
    const { conversations, conversa } = await comConversa();

    await expect(
      markConversationRead({ conversations }, ctxCom('viewer'), { conversationId: conversa.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/**
 * AT-10 — a ponte entre a conversa e o funil.
 *
 * É o movimento que dá sentido às duas metades: alguém chamou no WhatsApp, virou cartão, e a
 * conversa continua ligada ao cartão. Sem isso, o funil vira digitação e a caixa vira caixa
 * de e-mail.
 */
describe('AT-10: anexar conversa a uma oportunidade', () => {
  async function comFunil() {
    const { conversations, conversa } = await comConversa();
    const opportunities = fakeOpportunityRepository({
      stages: [
        {
          tenantId: 'tenant-a',
          id: 's-novo',
          name: 'Novo',
          position: 0,
          kind: 'open',
          archivedAt: null,
        },
      ],
      opportunities: [
        {
          tenantId: 'tenant-a',
          id: 'opp-1',
          stageId: 's-novo',
          contactName: 'Ana Prado',
          phone: null,
          email: null,
          itineraryId: null,
          customerId: null,
          bookingId: null,
          expectedValueCents: null,
          source: 'whatsapp',
          lostReason: null,
          createdAt: new Date('2026-09-01T00:00:00Z'),
          updatedAt: new Date('2026-09-01T00:00:00Z'),
          deleted: false,
        },
      ],
    });
    return { conversations, conversa, opportunities, audit: fakeAuditLogRepository() };
  }

  it('anexa e a conversa passa a apontar para o cartão', async () => {
    const { conversations, conversa, opportunities, audit } = await comFunil();

    const atualizada = await attachConversationToOpportunity(
      { conversations, opportunities, audit },
      ctxCom('operator'),
      { conversationId: conversa.id, opportunityId: 'opp-1' },
    );

    expect(atualizada.opportunityId).toBe('opp-1');
  });

  it('desanexar é permitido — vincular na pessoa errada acontece', async () => {
    const { conversations, conversa, opportunities, audit } = await comFunil();
    await attachConversationToOpportunity(
      { conversations, opportunities, audit },
      ctxCom('operator'),
      { conversationId: conversa.id, opportunityId: 'opp-1' },
    );

    const solta = await attachConversationToOpportunity(
      { conversations, opportunities, audit },
      ctxCom('operator'),
      { conversationId: conversa.id, opportunityId: null },
    );

    expect(solta.opportunityId).toBeNull();
  });

  it('oportunidade de outro tenant responde como se não existisse', async () => {
    const { conversations, conversa, opportunities, audit } = await comFunil();

    await expect(
      attachConversationToOpportunity({ conversations, opportunities, audit }, ctxCom('operator'), {
        conversationId: conversa.id,
        opportunityId: 'de-outro-tenant',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('viewer não anexa', async () => {
    const { conversations, conversa, opportunities, audit } = await comFunil();

    await expect(
      attachConversationToOpportunity({ conversations, opportunities, audit }, ctxCom('viewer'), {
        conversationId: conversa.id,
        opportunityId: 'opp-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/**
 * AT-13 — o anexo chega à tela por **URL assinada e curta**, nunca por caminho público.
 *
 * O bucket é privado: o que está lá é conversa de cliente, o conteúdo mais sensível que o
 * sistema guarda. A assinatura é feita no servidor, na hora de abrir o fio, e vale minutos —
 * link que vaza de um print deixa de funcionar sozinho.
 */
describe('AT-13: mídia no fio', () => {
  async function comAnexo() {
    const conversations = fakeConversationRepository();
    const media = fakeMediaStore();
    const conversa = await conversations.createConversation({
      tenantId: 'tenant-a',
      channel: 'whatsapp',
      channelUserId: '5548999998877',
      phone: '5548999998877',
      displayName: 'Ana Prado',
      customerId: null,
    });
    await conversations.addMessage({
      tenantId: 'tenant-a',
      conversationId: conversa.id,
      externalId: 'MSG-IMG',
      direction: 'in',
      body: '[imagem]',
      sentByUserId: null,
      media: {
        kind: 'image',
        mimeType: 'image/jpeg',
        fileName: null,
        path: 'tenant-a/conv/MSG-IMG',
        sizeBytes: 515262,
      },
      payload: {},
      sentAt: new Date('2026-09-03T10:00:00Z'),
    });
    return { conversations, media, conversa };
  }

  it('a mensagem com anexo vem com a URL para mostrar', async () => {
    const d = await comAnexo();

    const fio = await getConversation(d, ctxCom('operator'), { conversationId: d.conversa.id });

    expect(fio.messages[0]?.media).toMatchObject({
      kind: 'image',
      url: 'https://assinada/tenant-a/conv/MSG-IMG',
    });
  });

  it('mensagem de texto continua sem anexo nenhum', async () => {
    const d = await comAnexo();
    await d.conversations.addMessage({
      tenantId: 'tenant-a',
      conversationId: d.conversa.id,
      externalId: 'MSG-TXT',
      direction: 'in',
      body: 'oi',
      sentByUserId: null,
      media: null,
      payload: {},
      sentAt: new Date('2026-09-03T10:01:00Z'),
    });

    const fio = await getConversation(d, ctxCom('operator'), { conversationId: d.conversa.id });

    expect(fio.messages[1]?.media).toBeNull();
  });
});

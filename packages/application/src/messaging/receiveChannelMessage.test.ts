import { describe, expect, it } from 'vitest';
import { parseCpf } from '@expedition/domain';
import { fakeConversationRepository } from './conversationRepository.fake.js';
import { fakeChannelIntegrationRepository } from './channelIntegrationRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { receiveChannelMessage } from './receiveChannelMessage.js';
import { UnauthorizedError } from '../errors.js';
import type { RequestContext } from '../context.js';

const sistema: RequestContext = { tenantId: 'tenant-a', actor: { kind: 'system' } };

const CORPO = {
  event: 'messages.upsert',
  data: {
    key: { remoteJid: '5548999998877@s.whatsapp.net', fromMe: false, id: 'MSG-1' },
    pushName: 'Ana Prado',
    message: { conversation: 'Quanto custa a Coxilha Rica?' },
    messageTimestamp: 1788000000,
  },
};

function comCanal() {
  const conversations = fakeConversationRepository();
  const integrations = fakeChannelIntegrationRepository([
    {
      tenantId: 'tenant-a',
      id: 'ch-1',
      channel: 'whatsapp',
      provider: 'evolution',
      baseUrl: 'https://evo.exemplo',
      externalAccountId: 'drakkar',
      accessToken: 'chave',
      webhookToken: 'segredo-certo',
      active: true,
      connectedAt: new Date('2026-09-01T00:00:00Z'),
    },
  ]);
  const customers = fakeCustomerRepository();
  return { conversations, integrations, customers };
}

/**
 * AT-02..AT-06 — a mensagem que chega pelo webhook.
 *
 * Três coisas que o webhook do ASAAS ensinou e que valem igual aqui: o segredo autentica (não
 * a URL), a repetição não vira linha nova, e evento que não entendemos responde 200 em vez de
 * erro — devolver erro faria o provedor reenviar em laço para sempre.
 */
describe('AT-02: o segredo é que autentica', () => {
  it('token errado é recusado com 401, nunca 403', async () => {
    /*
     * O endereço do webhook é público e traz o slug do tenant. 403 confirmaria que aquele
     * tenant existe e tem canal conectado — enumeração de clientes da plataforma, um chute
     * por vez. Mesma decisão do webhook de pagamento.
     */
    const d = comCanal();

    await expect(
      receiveChannelMessage(d, sistema, { token: 'chute', body: CORPO }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('sem canal conectado responde igual a token errado', async () => {
    const d = { ...comCanal(), integrations: fakeChannelIntegrationRepository([]) };

    await expect(
      receiveChannelMessage(d, sistema, { token: 'segredo-certo', body: CORPO }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('AT-03..AT-05: a mensagem vira conversa', () => {
  it('primeira mensagem cria a conversa e guarda o texto', async () => {
    const d = comCanal();

    const r = await receiveChannelMessage(d, sistema, { token: 'segredo-certo', body: CORPO });

    expect(r).toEqual({ handled: true });
    const conversa = await d.conversations.findByChannelUser(
      'tenant-a',
      'whatsapp',
      '5548999998877',
    );
    expect(conversa).toMatchObject({ displayName: 'Ana Prado', unreadCount: 1 });
    const mensagens = await d.conversations.listMessages('tenant-a', conversa!.id);
    expect(mensagens.map((m) => m.body)).toEqual(['Quanto custa a Coxilha Rica?']);
  });

  it('a mesma mensagem reenviada não vira linha nova', async () => {
    const d = comCanal();
    await receiveChannelMessage(d, sistema, { token: 'segredo-certo', body: CORPO });

    const r = await receiveChannelMessage(d, sistema, { token: 'segredo-certo', body: CORPO });

    expect(r).toEqual({ handled: false });
    const conversa = await d.conversations.findByChannelUser(
      'tenant-a',
      'whatsapp',
      '5548999998877',
    );
    expect(await d.conversations.listMessages('tenant-a', conversa!.id)).toHaveLength(1);
  });

  it('segunda mensagem entra na mesma conversa', async () => {
    const d = comCanal();
    await receiveChannelMessage(d, sistema, { token: 'segredo-certo', body: CORPO });

    await receiveChannelMessage(d, sistema, {
      token: 'segredo-certo',
      body: { ...CORPO, data: { ...CORPO.data, key: { ...CORPO.data.key, id: 'MSG-2' } } },
    });

    const conversa = await d.conversations.findByChannelUser(
      'tenant-a',
      'whatsapp',
      '5548999998877',
    );
    expect(await d.conversations.listMessages('tenant-a', conversa!.id)).toHaveLength(2);
    expect(conversa?.unreadCount).toBe(2);
  });

  it('evento que não é mensagem responde 200 e não grava nada', async () => {
    const d = comCanal();

    const r = await receiveChannelMessage(d, sistema, {
      token: 'segredo-certo',
      body: { event: 'connection.update', data: {} },
    });

    expect(r).toEqual({ handled: false });
    expect(await d.conversations.listConversations('tenant-a')).toEqual([]);
  });

  it('mensagem enviada pelo celular pareado entra como saída e não conta como não lida', async () => {
    const d = comCanal();

    await receiveChannelMessage(d, sistema, {
      token: 'segredo-certo',
      body: {
        ...CORPO,
        data: { ...CORPO.data, key: { ...CORPO.data.key, fromMe: true } },
      },
    });

    const conversa = await d.conversations.findByChannelUser(
      'tenant-a',
      'whatsapp',
      '5548999998877',
    );
    expect(conversa?.unreadCount).toBe(0);
    const mensagens = await d.conversations.listMessages('tenant-a', conversa!.id);
    expect(mensagens[0]).toMatchObject({ direction: 'out', sentByUserId: null });
  });
});

describe('AT-06: casar com cliente existente pelo telefone', () => {
  async function comCliente(phone: string | null, quantos = 1) {
    const d = comCanal();
    for (let i = 0; i < quantos; i += 1) {
      await d.customers.create({
        tenantId: 'tenant-a',
        responsibleId: null,
        fullName: `Pessoa ${String(i)}`,
        cpf: parseCpf(['900.000.100-57', '111.444.777-35'][i] ?? '900.000.100-57'),
        birthDate: { year: 1985, month: 1, day: 1 },
        email: null,
        phone,
        address: EMPTY,
      });
    }
    return d;
  }

  it('telefone bate com um cliente: a conversa vem vinculada', async () => {
    const d = await comCliente('5548999998877');

    await receiveChannelMessage(d, sistema, { token: 'segredo-certo', body: CORPO });

    const conversa = await d.conversations.findByChannelUser(
      'tenant-a',
      'whatsapp',
      '5548999998877',
    );
    expect(conversa?.customerId).not.toBeNull();
  });

  it('telefone não bate com ninguém: a conversa fica solta, e nenhum cliente é criado', async () => {
    const d = await comCliente('5511999990000');

    await receiveChannelMessage(d, sistema, { token: 'segredo-certo', body: CORPO });

    const conversa = await d.conversations.findByChannelUser(
      'tenant-a',
      'whatsapp',
      '5548999998877',
    );
    expect(conversa?.customerId).toBeNull();
    expect(await d.customers.search('tenant-a', 'Ana Prado', 'name')).toEqual([]);
  });

  it('telefone repetido em duas fichas não casa com nenhuma', async () => {
    /*
     * Família compartilhando um número é comum aqui — o telefone do responsável costuma
     * estar em mais de uma ficha. Escolher uma seria adivinhar, e adivinhar joga a conversa
     * na pessoa errada. A equipe vincula à mão, que é reversível.
     */
    const d = await comCliente('5548999998877', 2);

    await receiveChannelMessage(d, sistema, { token: 'segredo-certo', body: CORPO });

    const conversa = await d.conversations.findByChannelUser(
      'tenant-a',
      'whatsapp',
      '5548999998877',
    );
    expect(conversa?.customerId).toBeNull();
  });
});

const EMPTY = {
  street: null,
  number: null,
  district: null,
  city: null,
  state: null,
  zip: null,
};

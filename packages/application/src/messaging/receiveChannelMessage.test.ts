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
      allowedIps: [],
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
      receiveChannelMessage(d, sistema, {
        token: 'chute',
        clientIp: '',
        channel: 'whatsapp',
        body: CORPO,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('sem canal conectado responde igual a token errado', async () => {
    const d = { ...comCanal(), integrations: fakeChannelIntegrationRepository([]) };

    await expect(
      receiveChannelMessage(d, sistema, {
        token: 'segredo-certo',
        clientIp: '',
        channel: 'whatsapp' as const,
        body: CORPO,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('AT-03..AT-05: a mensagem vira conversa', () => {
  it('primeira mensagem cria a conversa e guarda o texto', async () => {
    const d = comCanal();

    const r = await receiveChannelMessage(d, sistema, {
      token: 'segredo-certo',
      clientIp: '',
      channel: 'whatsapp' as const,
      body: CORPO,
    });

    expect(r).toEqual({ handled: true });
    const conversa = await d.conversations.findByChannelUser('tenant-a', 'whatsapp', {
      channelUserId: '5548999998877',
      phone: '5548999998877',
    });
    expect(conversa).toMatchObject({ displayName: 'Ana Prado', unreadCount: 1 });
    const mensagens = await d.conversations.listMessages('tenant-a', conversa!.id);
    expect(mensagens.map((m) => m.body)).toEqual(['Quanto custa a Coxilha Rica?']);
  });

  it('a mesma mensagem reenviada não vira linha nova', async () => {
    const d = comCanal();
    await receiveChannelMessage(d, sistema, {
      token: 'segredo-certo',
      clientIp: '',
      channel: 'whatsapp' as const,
      body: CORPO,
    });

    const r = await receiveChannelMessage(d, sistema, {
      token: 'segredo-certo',
      clientIp: '',
      channel: 'whatsapp' as const,
      body: CORPO,
    });

    expect(r).toEqual({ handled: false });
    const conversa = await d.conversations.findByChannelUser('tenant-a', 'whatsapp', {
      channelUserId: '5548999998877',
      phone: '5548999998877',
    });
    expect(await d.conversations.listMessages('tenant-a', conversa!.id)).toHaveLength(1);
  });

  it('segunda mensagem entra na mesma conversa', async () => {
    const d = comCanal();
    await receiveChannelMessage(d, sistema, {
      token: 'segredo-certo',
      clientIp: '',
      channel: 'whatsapp' as const,
      body: CORPO,
    });

    await receiveChannelMessage(d, sistema, {
      token: 'segredo-certo',
      clientIp: '',
      channel: 'whatsapp',
      body: { ...CORPO, data: { ...CORPO.data, key: { ...CORPO.data.key, id: 'MSG-2' } } },
    });

    const conversa = await d.conversations.findByChannelUser('tenant-a', 'whatsapp', {
      channelUserId: '5548999998877',
      phone: '5548999998877',
    });
    expect(await d.conversations.listMessages('tenant-a', conversa!.id)).toHaveLength(2);
    expect(conversa?.unreadCount).toBe(2);
  });

  it('evento que não é mensagem responde 200 e não grava nada', async () => {
    const d = comCanal();

    const r = await receiveChannelMessage(d, sistema, {
      token: 'segredo-certo',
      clientIp: '',
      channel: 'whatsapp',
      body: { event: 'connection.update', data: {} },
    });

    expect(r).toEqual({ handled: false });
    expect(await d.conversations.listConversations('tenant-a')).toEqual([]);
  });

  it('mensagem enviada pelo celular pareado entra como saída e não conta como não lida', async () => {
    const d = comCanal();

    await receiveChannelMessage(d, sistema, {
      token: 'segredo-certo',
      clientIp: '',
      channel: 'whatsapp',
      body: {
        ...CORPO,
        data: { ...CORPO.data, key: { ...CORPO.data.key, fromMe: true } },
      },
    });

    const conversa = await d.conversations.findByChannelUser('tenant-a', 'whatsapp', {
      channelUserId: '5548999998877',
      phone: '5548999998877',
    });
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

    await receiveChannelMessage(d, sistema, {
      token: 'segredo-certo',
      clientIp: '',
      channel: 'whatsapp' as const,
      body: CORPO,
    });

    const conversa = await d.conversations.findByChannelUser('tenant-a', 'whatsapp', {
      channelUserId: '5548999998877',
      phone: '5548999998877',
    });
    expect(conversa?.customerId).not.toBeNull();
  });

  it('telefone não bate com ninguém: a conversa fica solta, e nenhum cliente é criado', async () => {
    const d = await comCliente('5511999990000');

    await receiveChannelMessage(d, sistema, {
      token: 'segredo-certo',
      clientIp: '',
      channel: 'whatsapp' as const,
      body: CORPO,
    });

    const conversa = await d.conversations.findByChannelUser('tenant-a', 'whatsapp', {
      channelUserId: '5548999998877',
      phone: '5548999998877',
    });
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

    await receiveChannelMessage(d, sistema, {
      token: 'segredo-certo',
      clientIp: '',
      channel: 'whatsapp' as const,
      body: CORPO,
    });

    const conversa = await d.conversations.findByChannelUser('tenant-a', 'whatsapp', {
      channelUserId: '5548999998877',
      phone: '5548999998877',
    });
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

/**
 * AT-02 — a **cerca de origem**, para provedor que não deixa configurar nada na chamada.
 *
 * A Evolution instalada aqui não tem campo de cabeçalho nem de corpo: a chamada chega como
 * ela quiser mandar. Sobra saber de quem é a conexão. Quando a equipe declara o endereço do
 * servidor da instância, ele passa a valer como autenticação — e o segredo deixa de precisar
 * viajar em URL, que era o preço da alternativa anterior.
 *
 * As duas formas convivem: quem consegue mandar segredo continua entrando por ele.
 */
describe('AT-02: cerca por endereço de origem', () => {
  const DO_SERVIDOR = '69.62.88.81';

  function comCerca(allowedIps: readonly string[]) {
    return fakeChannelIntegrationRepository([
      {
        tenantId: 'tenant-a',
        id: 'ch-1',
        channel: 'whatsapp',
        provider: 'evolution',
        baseUrl: 'https://evo.local',
        externalAccountId: 'drakkar',
        accessToken: 'CHAVE',
        allowedIps,
        webhookToken: 'SEGREDO',
        active: true,
        connectedAt: new Date('2026-09-01T00:00:00Z'),
      },
    ]);
  }

  it('sem segredo nenhum, o endereço declarado autentica', async () => {
    const deps = { ...comCanal(), integrations: comCerca([DO_SERVIDOR]) };

    const resultado = await receiveChannelMessage(deps, sistema, {
      token: '',
      clientIp: DO_SERVIDOR,
      channel: 'whatsapp',
      body: CORPO,
    });

    expect(resultado.handled).toBe(true);
  });

  it('endereço de fora não entra, mesmo com a cerca ligada', async () => {
    const deps = { ...comCanal(), integrations: comCerca([DO_SERVIDOR]) };

    await expect(
      receiveChannelMessage(deps, sistema, {
        token: '',
        clientIp: '203.0.113.9',
        channel: 'whatsapp',
        body: CORPO,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('cerca desligada e sem segredo: não entra ninguém', async () => {
    const deps = { ...comCanal(), integrations: comCerca([]) };

    await expect(
      receiveChannelMessage(deps, sistema, {
        token: '',
        clientIp: DO_SERVIDOR,
        channel: 'whatsapp',
        body: CORPO,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('o segredo continua valendo, venha de onde vier', async () => {
    const deps = { ...comCanal(), integrations: comCerca([DO_SERVIDOR]) };

    const resultado = await receiveChannelMessage(deps, sistema, {
      token: 'SEGREDO',
      clientIp: '203.0.113.9',
      channel: 'whatsapp',
      body: CORPO,
    });

    expect(resultado.handled).toBe(true);
  });

  it('canal sem conexão nenhuma recusa, e não vaza que o tenant existe', async () => {
    const deps = { ...comCanal(), integrations: fakeChannelIntegrationRepository([]) };

    await expect(
      receiveChannelMessage(deps, sistema, {
        token: '',
        clientIp: DO_SERVIDOR,
        channel: 'whatsapp',
        body: CORPO,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

/**
 * AT-05 — o mesmo contato, endereçado das duas formas, é **uma** conversa.
 *
 * Durante a migração do WhatsApp para o LID a mesma pessoa chega ora por telefone, ora por
 * LID. Sem tratar isso, cada forma abriria um fio próprio: a equipe responderia num, o cliente
 * leria o outro, e o histórico ficaria partido ao meio sem ninguém entender por quê.
 *
 * A conversa é procurada pelas duas formas, e quando o LID aparece ela **converge** para ele —
 * o LID é o que não muda, telefone o cliente troca.
 */
describe('AT-05: LID e telefone são a mesma conversa', () => {
  const doTelefone = {
    event: 'messages.upsert',
    data: {
      key: { id: 'MSG-A', fromMe: false, remoteJid: '5548999998877@s.whatsapp.net' },
      pushName: 'Ana Prado',
      message: { conversation: 'oi' },
      messageTimestamp: 1788000000,
    },
  };
  const doLid = {
    event: 'messages.upsert',
    data: {
      key: {
        id: 'MSG-B',
        fromMe: false,
        remoteJid: '187654321098765@lid',
        remoteJidAlt: '5548999998877@s.whatsapp.net',
      },
      pushName: 'Ana Prado',
      message: { conversation: 'e o valor?' },
      messageTimestamp: 1788000100,
    },
  };
  const comando = (body: unknown) => ({
    token: 'segredo-certo',
    clientIp: '',
    channel: 'whatsapp' as const,
    body,
  });

  it('chegou por telefone e depois por LID: continua uma conversa só', async () => {
    const d = comCanal();

    await receiveChannelMessage(d, sistema, comando(doTelefone));
    await receiveChannelMessage(d, sistema, comando(doLid));

    expect(d.conversations.conversations).toHaveLength(1);
    expect(d.conversations.messages).toHaveLength(2);
  });

  it('quando o LID aparece, a conversa passa a ser identificada por ele', async () => {
    const d = comCanal();
    await receiveChannelMessage(d, sistema, comando(doTelefone));

    await receiveChannelMessage(d, sistema, comando(doLid));

    expect(d.conversations.conversations[0]).toMatchObject({
      channelUserId: '187654321098765',
      phone: '5548999998877',
    });
  });

  it('chegou por LID e depois por telefone: também não abre outra', async () => {
    const d = comCanal();

    await receiveChannelMessage(d, sistema, comando(doLid));
    await receiveChannelMessage(d, sistema, comando(doTelefone));

    expect(d.conversations.conversations).toHaveLength(1);
  });

  it('só LID, sem telefone: a conversa existe e fica sem número', async () => {
    const d = comCanal();

    await receiveChannelMessage(
      d,
      sistema,
      comando({
        ...doLid,
        data: { ...doLid.data, key: { ...doLid.data.key, remoteJidAlt: undefined } },
      }),
    );

    expect(d.conversations.conversations[0]).toMatchObject({
      channelUserId: '187654321098765',
      phone: null,
    });
  });

  /**
   * AT-06 — casar com a ficha do cliente é **pelo telefone**. O LID não é número e não existe
   * em cadastro nenhum; procurar cliente por ele não acharia nunca, em silêncio.
   */
  it('o vínculo com o cliente usa o telefone, não o LID', async () => {
    const d = comCanal();
    const cliente = await d.customers.create({
      tenantId: 'tenant-a',
      responsibleId: null,
      fullName: 'Ana Prado',
      cpf: parseCpf('900.000.100-57'),
      birthDate: { year: 1990, month: 5, day: 2 },
      email: null,
      phone: '5548999998877',
      address: EMPTY,
    });

    await receiveChannelMessage(d, sistema, comando(doLid));

    expect(d.conversations.conversations[0]?.customerId).toBe(cliente.id);
  });
});

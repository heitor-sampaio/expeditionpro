import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryCustomers } from '../dev/inMemoryCustomers.js';
import { inMemoryVehicles } from '../dev/inMemoryVehicles.js';
import { inMemoryItineraries } from '../dev/inMemoryItineraries.js';
import { inMemorySchedule } from '../dev/inMemorySchedule.js';
import { inMemoryBookings } from '../dev/inMemoryBookings.js';
import { inMemoryPayments } from '../dev/inMemoryPayments.js';
import { inMemorySuppliers } from '../dev/inMemorySuppliers.js';
import { inMemoryApiKeys, inMemoryIntake } from '../dev/inMemoryIntake.js';
import { inMemoryFormMappings } from '../dev/inMemoryFormMappings.js';
import { inMemoryTenants } from '../dev/inMemoryTenants.js';
import { inMemoryCashback } from '../dev/inMemoryCashback.js';
import { inMemoryCoupons } from '../dev/inMemoryCoupons.js';
import { inMemoryIdentityChange } from '../dev/inMemoryIdentityChange.js';
import { inMemoryAudit } from '../dev/inMemoryAudit.js';
import { inMemoryLegalDocuments } from '../dev/inMemoryLegalDocuments.js';
import { inMemoryConsents } from '../dev/inMemoryConsents.js';
import { inMemoryCommunity } from '../dev/inMemoryCommunity.js';
import { inMemoryMediaConsents } from '../dev/inMemoryMediaConsents.js';
import {
  inMemoryPaymentIntegrations,
  inMemoryPaymentCharges,
} from '../dev/inMemoryPaymentGateway.js';
import { asaasGateway } from '@expedition/infrastructure';
import type { RequestContext } from '@expedition/application';
import type { FastifyInstance } from 'fastify';

const equipe: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};
const ana: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'auth-ana', customerId: 'ana' },
};
const rui: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'auth-rui', customerId: 'rui' },
};

/* Quem a rota diz ser — mutável, para trocar de audiência dentro do mesmo servidor. */
let atual: RequestContext = equipe;

function build(): Promise<FastifyInstance> {
  const bookings = inMemoryBookings();
  return buildServer({
    logger: false,
    deps: {
      customers: inMemoryCustomers(),
      vehicles: inMemoryVehicles(),
      itineraries: inMemoryItineraries(),
      schedule: inMemorySchedule(),
      bookings,
      payments: inMemoryPayments(bookings.rows),
      suppliers: inMemorySuppliers(),
      apiKeys: inMemoryApiKeys([]),
      intake: inMemoryIntake(),
      formMappings: inMemoryFormMappings(),
      tenants: inMemoryTenants(),
      cashback: inMemoryCashback(),
      coupons: inMemoryCoupons(),
      identityRequests: inMemoryIdentityChange(),
      audit: inMemoryAudit(),
      documents: inMemoryLegalDocuments(),
      consents: inMemoryConsents(),
      community: inMemoryCommunity(),
      media: inMemoryMediaConsents(),
      paymentIntegrations: inMemoryPaymentIntegrations(),
      charges: inMemoryPaymentCharges(),
      paymentGateway: asaasGateway(),
      resolveContext: () => Promise.resolve(atual),
    },
  });
}

/**
 * Rotas da comunidade (§5.12) — não tinham teste nenhum. Foi um teste de borda que pegou o
 * buraco dos roteiros nesta mesma sessão: guarda no caso de uso não vale nada se a rota
 * ler o repositório direto. Aqui a prova é que a rota **passa** pelo caso de uso guardado.
 */

describe('CO-01/CO-09/CO-10: comunidade pela borda HTTP', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build();
    await app.ready();
  });

  afterAll(async () => {
    atual = equipe;
    await app.close();
  });

  async function postDaAna(): Promise<string> {
    atual = ana;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/community/posts',
      payload: { body: 'subindo a serra', media: [{ storagePath: 'a/1.webp' }] },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id;
  }

  it('CO-01: o cliente publica e o post entra no feed', async () => {
    const id = await postDaAna();
    const feed = await app.inject({ method: 'GET', url: '/v1/community/feed' });
    expect(feed.statusCode).toBe(200);
    expect(feed.json().map((p: { id: string }) => p.id)).toContain(id);
  });

  it('CO-09: só o autor apaga a própria publicação', async () => {
    const id = await postDaAna();

    atual = rui;
    expect(
      (await app.inject({ method: 'DELETE', url: `/v1/community/posts/${id}` })).statusCode,
    ).toBe(403);

    atual = ana;
    expect(
      (await app.inject({ method: 'DELETE', url: `/v1/community/posts/${id}` })).statusCode,
    ).toBe(204);
  });

  it('CO-10: o comentário diz se é do leitor e só o autor apaga', async () => {
    const postId = await postDaAna();

    atual = ana;
    const daAna = (
      await app.inject({
        method: 'POST',
        url: `/v1/community/posts/${postId}/comments`,
        payload: { body: 'meu comentário' },
      })
    ).json();
    expect(daAna.mine).toBe(true);

    // para o Rui, o mesmo comentário não é dele — e ele não apaga
    atual = rui;
    const lidos = (
      await app.inject({ method: 'GET', url: `/v1/community/posts/${postId}/comments` })
    ).json();
    expect(lidos.find((c: { id: string }) => c.id === daAna.id).mine).toBe(false);
    expect(
      (await app.inject({ method: 'DELETE', url: `/v1/community/comments/${daAna.id}` }))
        .statusCode,
    ).toBe(403);

    atual = ana;
    expect(
      (await app.inject({ method: 'DELETE', url: `/v1/community/comments/${daAna.id}` }))
        .statusCode,
    ).toBe(204);

    const restantes = (
      await app.inject({ method: 'GET', url: `/v1/community/posts/${postId}/comments` })
    ).json();
    expect(restantes).toHaveLength(0);
  });

  it('SEC-01: a equipe não apaga post de cliente por aqui — o caminho dela é a moderação', async () => {
    const postId = await postDaAna();

    atual = equipe;
    /*
     * Curtir e comentar a equipe pode — é a voz da marca, e o `liker_id` aceita usuário de
     * equipe de propósito. Apagar publicação de cliente, não: para isso existe a moderação
     * (CO-08), que deixa rastro e motivo. Apagar direto seria censura sem registro.
     */
    const apagar = await app.inject({ method: 'DELETE', url: `/v1/community/posts/${postId}` });
    expect(apagar.statusCode).toBe(403);
  });
});

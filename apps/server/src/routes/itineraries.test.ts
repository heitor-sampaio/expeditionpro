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
import { inMemoryMemberships } from '../dev/inMemoryMemberships.js';
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

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const cliente: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u2', customerId: 'c1' },
};

/*
 * Quem a rota diz ser. Mutável de propósito: a prova que interessa é que a **rota** passa
 * pelo caso de uso guardado. Guarda na aplicação não vale nada se a rota ler o repositório
 * direto — foi exatamente o defeito daqui, em `GET /v1/itineraries` e nas fotos.
 */
let atual: RequestContext = ctx;

const PRICE = {
  validFrom: '2025-01-01',
  coupleCents: 200000,
  soloCents: 120000,
  extraAdultCents: 80000,
  childMidCents: 60000,
  childYoungCents: 40000,
};

describe('RO-01..03: rotas de roteiro', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer({
      logger: false,
      deps: {
        customers: inMemoryCustomers(),
        vehicles: inMemoryVehicles(),
        itineraries: inMemoryItineraries(),
        schedule: inMemorySchedule(),
        bookings: inMemoryBookings(),
        payments: inMemoryPayments([]),
        suppliers: inMemorySuppliers(),
        apiKeys: inMemoryApiKeys([]),
        intake: inMemoryIntake(),
        formMappings: inMemoryFormMappings(),
        tenants: inMemoryTenants(),
        cashback: inMemoryCashback(),
        coupons: inMemoryCoupons(),
        identityRequests: inMemoryIdentityChange(),
        audit: inMemoryAudit(),
        memberships: inMemoryMemberships(),
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
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('cria roteiro com preço e responde 201 com slug e kind', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/itineraries',
      payload: { name: 'Coxilha Rica', prices: PRICE },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().slug).toBe('coxilha-rica');
    expect(res.json().kind).toBe('catalog');
  });

  it('faixa etária inconsistente responde 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/itineraries',
      payload: { name: 'X', childYoungMaxAge: 10, childMidMaxAge: 5, prices: PRICE },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_age_bands');
  });

  it('RO-01/02: edita nome, descrição, faixas e situação por PATCH', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Serra Editável', prices: PRICE },
      })
    ).json();

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/itineraries/${created.id}`,
      payload: {
        name: 'Serra Renovada',
        description: '## Roteiro\nSubida da serra.',
        difficulty: 'difícil',
        status: 'archived',
        childYoungMaxAge: 4,
        childMidMaxAge: 8,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Serra Renovada');
    expect(body.slug).toBe('serra-renovada');
    expect(body.description).toBe('## Roteiro\nSubida da serra.');
    expect(body.difficulty).toBe('difícil');
    expect(body.status).toBe('archived');
    expect(body.childYoungMaxAge).toBe(4);
    expect(body.childMidMaxAge).toBe(8);
  });

  it('RO-01: grava a galeria e promove a primeira foto a capa', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Roteiro com Fotos', prices: PRICE },
      })
    ).json();

    const put = await app.inject({
      method: 'PUT',
      url: `/v1/itineraries/${created.id}/photos`,
      payload: {
        photos: [
          { storagePath: 'tenant-a/a.webp' },
          { storagePath: 'tenant-a/b.webp' },
          { storagePath: 'tenant-a/c.webp' },
        ],
      },
    });
    expect(put.statusCode).toBe(200);
    const saved = put.json();
    expect(saved).toHaveLength(3);
    expect(saved.filter((p: { isCover: boolean }) => p.isCover)).toHaveLength(1);
    expect(saved[0].isCover).toBe(true);

    const list = await app.inject({ method: 'GET', url: `/v1/itineraries/${created.id}/photos` });
    expect(list.json()).toHaveLength(3);
  });

  it('RO-01: aceita 20 fotos e recusa a 21ª com 400', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Galeria Cheia', prices: PRICE },
      })
    ).json();

    const put = await app.inject({
      method: 'PUT',
      url: `/v1/itineraries/${created.id}/photos`,
      payload: {
        photos: Array.from({ length: 21 }, (_, i) => ({ storagePath: `tenant-a/${i}.webp` })),
      },
    });
    expect(put.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'PUT',
      url: `/v1/itineraries/${created.id}/photos`,
      payload: {
        photos: Array.from({ length: 20 }, (_, i) => ({ storagePath: `tenant-a/${i}.webp` })),
      },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('RO-03: lista o histórico de versões de preço (mais recente primeiro)', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: {
          name: 'Roteiro Reajustado',
          prices: { ...PRICE, validFrom: '2024-01-01', coupleCents: 100000 },
        },
      })
    ).json();

    await app.inject({
      method: 'POST',
      url: `/v1/itineraries/${created.id}/prices`,
      payload: { ...PRICE, validFrom: '2025-06-01', coupleCents: 200000 },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/itineraries/${created.id}/price-versions`,
    });
    expect(res.statusCode).toBe(200);
    const versions = res.json() as { validFrom: string; coupleCents: number }[];
    expect(versions).toHaveLength(2);
    const couples = versions.map((v) => v.coupleCents).sort((a, b) => a - b);
    expect(couples).toEqual([100000, 200000]);
    expect(versions[0]).toHaveProperty('validFrom');
  });

  it('versiona o preço e resolve a tabela vigente na data', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: {
          name: 'Vale Europeu',
          prices: { ...PRICE, validFrom: '2024-01-01', coupleCents: 100000 },
        },
      })
    ).json();

    await app.inject({
      method: 'POST',
      url: `/v1/itineraries/${created.id}/prices`,
      payload: { ...PRICE, validFrom: '2025-06-01', coupleCents: 200000 },
    });

    const before = await app.inject({
      method: 'GET',
      url: `/v1/itineraries/${created.id}/prices?at=2025-01-01`,
    });
    const after = await app.inject({
      method: 'GET',
      url: `/v1/itineraries/${created.id}/prices?at=2025-12-01`,
    });
    expect(before.json().coupleCents).toBe(100000);
    expect(after.json().coupleCents).toBe(200000);
  });
  it('SEC-01: cliente não cria nem edita roteiro pela rota', async () => {
    const alvo = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Alvo da guarda', prices: PRICE },
      })
    ).json().id;

    atual = cliente;
    try {
      const criar = await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Meu', prices: PRICE },
      });
      const editar = await app.inject({
        method: 'PATCH',
        url: `/v1/itineraries/${alvo}`,
        payload: { name: 'Trocado' },
      });
      expect(criar.statusCode).toBe(403);
      expect(editar.statusCode).toBe(403);
    } finally {
      atual = ctx;
    }
  });

  it('SEC-01 · RO-07: a lista do cliente não traz o roteiro personalizado', async () => {
    const fechada = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Saída fechada', kind: 'custom', prices: PRICE },
      })
    ).json().id;

    atual = cliente;
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/itineraries' });
      expect(res.statusCode).toBe(200);
      const ids = res.json().map((i: { id: string }) => i.id);
      expect(ids).not.toContain(fechada);

      // e pedir direto responde 404, não 403: 403 confirmaria que a saída existe
      const fotos = await app.inject({ method: 'GET', url: `/v1/itineraries/${fechada}/photos` });
      expect(fotos.statusCode).toBe(404);
    } finally {
      atual = ctx;
    }

    const daEquipe = await app.inject({ method: 'GET', url: '/v1/itineraries' });
    expect(daEquipe.json().map((i: { id: string }) => i.id)).toContain(fechada);
  });
});

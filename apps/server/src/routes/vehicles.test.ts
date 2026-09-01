import { describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryCustomers } from '../dev/inMemoryCustomers.js';
import { inMemoryVehicles } from '../dev/inMemoryVehicles.js';
import { inMemoryItineraries } from '../dev/inMemoryItineraries.js';
import { inMemorySchedule } from '../dev/inMemorySchedule.js';
import { inMemoryBookings } from '../dev/inMemoryBookings.js';
import { inMemoryPayments } from '../dev/inMemoryPayments.js';
import { inMemorySuppliers } from '../dev/inMemorySuppliers.js';
import { inMemoryApiKeys, inMemoryIntake } from '../dev/inMemoryIntake.js';
import { inMemoryCashback } from '../dev/inMemoryCashback.js';
import { inMemoryCoupons } from '../dev/inMemoryCoupons.js';
import type { RequestContext } from '@expedition/application';
import type { FastifyInstance } from 'fastify';

/**
 * CL-05 — veículo do cliente pela API: listar os da família e editar o que já existe
 * (trocou de carro, corrigiu a placa). As regras (placa, catálogo, "Outro") estão no
 * caso de uso; aqui só o contrato HTTP e o DTO.
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const clienteCtx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u2', customerId: 'c1' },
};

/* Quem a rota diz ser — mutável para trocar a audiência dentro do mesmo servidor. */
let atual: RequestContext = ctx;

const BRANDS = [
  { id: 'brand-jeep', name: 'Jeep' },
  { id: 'brand-ford', name: 'Ford' },
];
const MODELS = [
  { id: 'model-wrangler', brandId: 'brand-jeep', name: 'Wrangler' },
  { id: 'model-ranger', brandId: 'brand-ford', name: 'Ranger' },
];

const RESP_PAYLOAD = {
  fullName: 'Heitor Sampaio',
  cpf: '900.000.100-57',
  birthDate: '1989-01-14',
  email: 'h@ex.com',
  phone: '48999998877',
};

async function server(): Promise<FastifyInstance> {
  const app = await buildServer({
    logger: false,
    deps: {
      customers: inMemoryCustomers(),
      vehicles: inMemoryVehicles({ brands: BRANDS, models: MODELS }),
      itineraries: inMemoryItineraries(),
      schedule: inMemorySchedule(),
      bookings: inMemoryBookings(),
      payments: inMemoryPayments([]),
      suppliers: inMemorySuppliers(),
      apiKeys: inMemoryApiKeys([]),
      intake: inMemoryIntake(),
      cashback: inMemoryCashback(),
      coupons: inMemoryCoupons(),
      resolveContext: () => Promise.resolve(atual),
    },
  });
  await app.ready();
  return app;
}

async function seedCustomerWithVehicle(app: FastifyInstance) {
  const customer = (
    await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
  ).json();
  const vehicle = (
    await app.inject({
      method: 'POST',
      url: `/v1/customers/${customer.id}/vehicles`,
      payload: { plate: 'ABC1D23', brandId: 'brand-jeep', modelId: 'model-wrangler' },
    })
  ).json();
  return { customer, vehicle };
}

describe('CL-05: GET /v1/customers/:id/vehicles', () => {
  it('lista os veículos do cliente com a placa formatada', async () => {
    const app = await server();
    const { customer, vehicle } = await seedCustomerWithVehicle(app);

    const res = await app.inject({ method: 'GET', url: `/v1/customers/${customer.id}/vehicles` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(vehicle.id);
    expect(body[0].plate).toBe('ABC1D23');
    expect(body[0].brandId).toBe('brand-jeep');
    await app.close();
  });
});

describe('CL-05: PATCH /v1/vehicles/:id', () => {
  it('troca placa e catálogo do veículo existente', async () => {
    const app = await server();
    const { customer, vehicle } = await seedCustomerWithVehicle(app);

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/vehicles/${vehicle.id}`,
      payload: { plate: 'XYZ9A88', brandId: 'brand-ford', modelId: 'model-ranger' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().plate).toBe('XYZ9A88');
    expect(res.json().modelId).toBe('model-ranger');

    // editou, não duplicou
    const list = (
      await app.inject({ method: 'GET', url: `/v1/customers/${customer.id}/vehicles` })
    ).json();
    expect(list).toHaveLength(1);
    await app.close();
  });

  it('placa inválida responde 422 e veículo inexistente responde 404', async () => {
    const app = await server();
    const { vehicle } = await seedCustomerWithVehicle(app);

    const invalid = await app.inject({
      method: 'PATCH',
      url: `/v1/vehicles/${vehicle.id}`,
      payload: { plate: 'XX' },
    });
    expect(invalid.statusCode).toBe(422);

    const missing = await app.inject({
      method: 'PATCH',
      url: '/v1/vehicles/nao-existe',
      payload: { plate: 'ABC1D23' },
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});

/*
 * SEC-01 — a rota de back-office pendura acompanhante e veículo em QUALQUER cliente, então
 * é ela que barra o cliente. O caso de uso fica sem guarda de propósito: o portal chega
 * nele por `registerFamilyCompanion`/`savePortalVehicle`, que escopam à própria família
 * (PC-06, PC-08). Guarda no caso de uso compartilhado quebraria o caminho legítimo — a
 * suíte pegou exatamente isso quando tentei.
 */
describe('SEC-01: rota de back-office de veículo barra o cliente', () => {
  it('cliente recebe 403 ao anexar veículo a outro cliente', async () => {
    const app = await server();
    const customer = (
      await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
    ).json();

    atual = clienteCtx;
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/customers/${customer.id}/vehicles`,
        payload: { plate: 'XYZ9K88', brandId: 'brand-jeep', modelId: 'model-wrangler' },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      atual = ctx;
      await app.close();
    }
  });
});

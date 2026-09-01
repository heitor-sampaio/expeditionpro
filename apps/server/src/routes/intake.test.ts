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

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const TOKEN = 'epk_live_drk_teste';

function payload() {
  return {
    entry_id: 9,
    form_id: 4641,
    submitted: '2026-08-11T18:57:17-03:00',
    fields: {
      resp_nome: { value: 'Heitor Sampaio' },
      resp_cpf: { value: '900.000.100-57' },
      resp_email: { value: 'a@b.com' },
      resp_telefone: { value: '(48) 99999-8877' },
      resp_nascimento: { value: '1989-01-14' },
      acomp_1_nome: { value: 'Fulana' },
      acomp_1_cpf: { value: '12345678909' },
      acomp_1_nascimento: { value: '2015-03-22' },
    },
  };
}

describe('IN-01/IN-02: webhook POST /v1/intake/:tenantSlug', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const bookings = inMemoryBookings();
    app = await buildServer({
      logger: false,
      deps: {
        customers: inMemoryCustomers(),
        vehicles: inMemoryVehicles(),
        itineraries: inMemoryItineraries(),
        schedule: inMemorySchedule(),
        bookings,
        payments: inMemoryPayments(bookings.rows),
        suppliers: inMemorySuppliers(),
        apiKeys: inMemoryApiKeys([
          {
            token: TOKEN,
            tenantSlug: 'drk',
            tenantId: 'tenant-a',
            keyId: 'k1',
            scopes: ['intake:write'],
          },
        ]),
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
        resolveContext: () => Promise.resolve(ctx),
      },
    });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('enfileira e responde 202 queued; a fila lista o recebido', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/intake/drk',
      headers: { api_token: TOKEN },
      payload: payload(),
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('queued');

    const queue = await app.inject({ method: 'GET', url: '/v1/intake' });
    expect(queue.json().length).toBeGreaterThanOrEqual(1);
    const item = queue.json()[0];
    expect(item.externalId).toBe('4641:9');
    expect(item.status).toBe('needs_allocation');
    expect(item.responsibleName).toBe('Heitor Sampaio');
    expect(item.responsibleCpf).toBe('900.***.***-57'); // mascarado (SEC-04)
    expect(item.companionCount).toBe(1);
  });

  it('IN-02: reenvio idêntico responde 200 duplicate', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/intake/drk',
      headers: { api_token: TOKEN },
      payload: payload(),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/intake/drk',
      headers: { api_token: TOKEN },
      payload: payload(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('duplicate');
  });

  it('sem api_token responde 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/intake/drk', payload: payload() });
    expect(res.statusCode).toBe(401);
  });

  it('slug de outro tenant responde 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/intake/outro',
      headers: { api_token: TOKEN },
      payload: payload(),
    });
    expect(res.statusCode).toBe(401);
  });

  it('CPF inválido responde 422 validation_failed com o campo', async () => {
    const bad = payload();
    bad.entry_id = 900; // id fresco: um reenvio do mesmo entry cairia no dedup (200)
    bad.fields.resp_cpf = { value: '90000010000' };
    const res = await app.inject({
      method: 'POST',
      url: '/v1/intake/drk',
      headers: { api_token: TOKEN },
      payload: bad,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('validation_failed');
    expect(res.json().fields.resp_cpf).toBe('invalid_check_digit');
  });

  it('IN-05: CPF inválido é gravado como error na fila com a causa, e reprocessar ainda falha (422)', async () => {
    const bad = payload();
    bad.entry_id = 901;
    bad.fields.resp_cpf = { value: '90000010000' };
    const res = await app.inject({
      method: 'POST',
      url: '/v1/intake/drk',
      headers: { api_token: TOKEN },
      payload: bad,
    });
    expect(res.statusCode).toBe(422);

    // a fila expõe o item em error com a causa
    const queue = await app.inject({ method: 'GET', url: '/v1/intake' });
    const errored = queue.json().find((i: { externalId: string }) => i.externalId === '4641:901');
    expect(errored.status).toBe('error');
    expect(errored.error).toBe('resp_cpf: invalid_check_digit');

    // reprocessar o mesmo payload inválido → 422 de novo, segue em error
    const retry = await app.inject({
      method: 'POST',
      url: `/v1/intake/${errored.id}/reprocess`,
    });
    expect(retry.statusCode).toBe(422);
    expect(retry.json().fields.resp_cpf).toBe('invalid_check_digit');
  });

  it('IN-05: reprocessar uma inscrição que não está em error → 400 not_reprocessable', async () => {
    const ok = payload();
    ok.entry_id = 902;
    const posted = await app.inject({
      method: 'POST',
      url: '/v1/intake/drk',
      headers: { api_token: TOKEN },
      payload: ok,
    });
    expect(posted.statusCode).toBe(202);
    const queue = await app.inject({ method: 'GET', url: '/v1/intake' });
    const item = queue.json().find((i: { externalId: string }) => i.externalId === '4641:902');

    const res = await app.inject({
      method: 'POST',
      url: `/v1/intake/${item.id}/reprocess`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('not_reprocessable');
  });

  it('IN-18: aloca da fila criando cliente + booking pending; sai da fila', async () => {
    const PRICE = {
      validFrom: '2025-01-01',
      coupleCents: 200000,
      soloCents: 120000,
      extraAdultCents: 80000,
      childMidCents: 60000,
      childYoungCents: 40000,
    };
    const itin = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Fila Rica', prices: PRICE },
      })
    ).json();
    const ev = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId: itin.id, startDate: '2025-11-10', endDate: '2025-11-14' },
      })
    ).json();

    const p = payload();
    p.entry_id = 555;
    const recv = (
      await app.inject({
        method: 'POST',
        url: '/v1/intake/drk',
        headers: { api_token: TOKEN },
        payload: p,
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/v1/intake/${recv.intake_id}/allocate`,
      payload: { groupId: ev.group.id },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().participantCount).toBe(2); // responsável + 1 acompanhante
    expect(res.json().bookingId).toBeDefined();

    // saiu da fila
    const queue = (await app.inject({ method: 'GET', url: '/v1/intake' })).json();
    expect(queue.some((r: { id: string }) => r.id === recv.intake_id)).toBe(false);
  });

  it('IN-21: cria chave (token uma vez), lista mascarado sem token, revoga', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/api-keys',
      payload: { name: 'Webhook do site' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().token).toContain('epk_');
    const keyId = created.json().key.id;

    const list = await app.inject({ method: 'GET', url: '/v1/api-keys' });
    const row = list.json().find((k: { id: string }) => k.id === keyId);
    expect(row.masked).toContain('••••');
    expect(row).not.toHaveProperty('token');
    expect(row.revoked).toBe(false);

    const del = await app.inject({ method: 'DELETE', url: `/v1/api-keys/${keyId}` });
    expect(del.statusCode).toBe(204);
    const after = await app.inject({ method: 'GET', url: '/v1/api-keys' });
    expect(after.json().find((k: { id: string }) => k.id === keyId).revoked).toBe(true);
  });

  it('IN-24: vitrine pública responde 200 com array (sem autenticação)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/public/drk/groups?status=open' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('IN-24: form-schema público responde 200 com os campos e o bloco de acompanhante', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/public/drk/form-schema' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const cpf = body.fields.find((f: { key: string }) => f.key === 'resp_cpf');
    expect(cpf).toMatchObject({ type: 'cpf', required: true });
    expect(body.companion.map((f: { key: string }) => f.key)).toEqual([
      'nome',
      'cpf',
      'nascimento',
    ]);
  });

  it('IN-19: descarta com motivo → 204 e sai da fila', async () => {
    const p = payload();
    p.entry_id = 777;
    const recv = (
      await app.inject({
        method: 'POST',
        url: '/v1/intake/drk',
        headers: { api_token: TOKEN },
        payload: p,
      })
    ).json();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/intake/${recv.intake_id}/discard`,
      payload: { reason: 'lead duplicado' },
    });
    expect(res.statusCode).toBe(204);
    const queue = (await app.inject({ method: 'GET', url: '/v1/intake' })).json();
    expect(queue.some((r: { id: string }) => r.id === recv.intake_id)).toBe(false);
  });

  it('IN-20: configura o mapa form_id→roteiro e uma nova inscrição já chega com o roteiro', async () => {
    const itin = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: {
          name: 'Roteiro do Form',
          prices: {
            validFrom: '2025-01-01',
            coupleCents: 200000,
            soloCents: 120000,
            extraAdultCents: 80000,
            childMidCents: 60000,
            childYoungCents: 40000,
          },
        },
      })
    ).json();

    const put = await app.inject({
      method: 'PUT',
      url: '/v1/form-mappings',
      payload: { source: 'wp_flat_v1', formId: '4641', itineraryId: itin.id },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().itineraryId).toBe(itin.id);

    const list = (await app.inject({ method: 'GET', url: '/v1/form-mappings' })).json();
    const mapped = list.find((m: { formId: string }) => m.formId === '4641');
    expect(mapped.itineraryName).toBe('Roteiro do Form');

    // nova inscrição do form 4641 chega com o roteiro resolvido
    const p = payload();
    p.entry_id = 4242;
    const recv = (
      await app.inject({
        method: 'POST',
        url: '/v1/intake/drk',
        headers: { api_token: TOKEN },
        payload: p,
      })
    ).json();
    const queue = (await app.inject({ method: 'GET', url: '/v1/intake' })).json();
    const item = queue.find((r: { id: string }) => r.id === recv.intake_id);
    expect(item.itineraryId).toBe(itin.id);
    // IN-20b: sem grupo aberto futuro desse roteiro, a sugestão vem null (campo presente)
    expect(item.suggestedGroupId).toBeNull();
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
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
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

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
      resolveContext: () => Promise.resolve(ctx),
    },
  });
}

describe('DOC-01..05: Termo de adesão via HTTP', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await build();
    await app.ready();
  });

  it('salva rascunho, publica e o cliente aceita (status vira coberto)', async () => {
    const draft = await app.inject({
      method: 'PUT',
      url: '/v1/documents/term/draft',
      payload: { markdown: '## Termo\n\nOlá {{cliente_nome}}, texto **forte**.' },
    });
    expect(draft.statusCode).toBe(200);
    expect(draft.json().isDraft).toBe(true);
    // DOC-09: o HTML guardado é renderizado por allowlist a partir do markdown
    expect(draft.json().contentHtml).toContain('<h2>Termo</h2>');
    expect(draft.json().contentHtml).toContain('{{cliente_nome}}');

    const published = await app.inject({
      method: 'POST',
      url: '/v1/documents/term/publish',
      payload: { requiresReacceptance: false, changeSummary: 'v1' },
    });
    expect(published.statusCode).toBe(201);
    expect(published.json().versionNumber).toBe(1);
    expect(published.json().isDraft).toBe(false);

    const before = await app.inject({ method: 'GET', url: '/v1/customers/cust-1/term' });
    expect(before.json()).toMatchObject({ mustAccept: true, versionNumber: 1 });

    const accept = await app.inject({
      method: 'POST',
      url: '/v1/customers/cust-1/term/accept',
    });
    expect(accept.statusCode).toBe(201);
    expect(accept.json().channel).toBe('admin');

    const after = await app.inject({ method: 'GET', url: '/v1/customers/cust-1/term' });
    expect(after.json().mustAccept).toBe(false);
  });

  it('aceite duplicado do mesmo cliente responde 400 already_accepted', async () => {
    const dup = await app.inject({ method: 'POST', url: '/v1/customers/cust-1/term/accept' });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().error).toBe('already_accepted');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from './client.js';
import { tenantClient } from './tenantClient.js';
import { resetSchema, testDatabaseUrl } from '../testkit/db.js';
import type { PrismaClient } from './client.js';

/**
 * SEC-02 — isolamento pela **via do Prisma**, nos seis modelos que estavam de fora.
 *
 * A lacuna que deixou o furo verde por semanas: as `*.rls.test.ts` de cupom, integração de
 * pagamento, categoria e foto exercitam **sessões SQL cruas**, onde a RLS vale. Mas o
 * servidor não vai por ali — o role do Prisma tem `BYPASSRLS`. O único teste que tocava a
 * Client Extension era `isolation.rls.test.ts`, e só com `customers`, que já estava na
 * lista. Toda a defesa real desses seis modelos não tinha teste nenhum.
 *
 * O que estava aberto: `PaymentIntegration` sem escopo significava que o tenant B emitia
 * cobrança com o token do ASAAS do tenant A, sobrescrevia a credencial dele ao conectar o
 * próprio gateway, e apagava a integração de todo mundo com um `deleteMany`.
 */
describe('SEC-02: os seis modelos que cruzavam tenant (Prisma + Postgres real)', () => {
  let base: PrismaClient;
  let tenantA: string;
  let tenantB: string;
  let itinerarioB: string;

  beforeAll(async () => {
    await resetSchema();
    base = createPrismaClient(testDatabaseUrl());
    tenantA = (await base.tenant.create({ data: { name: 'Drakkar', slug: 'drk' } })).id;
    tenantB = (await base.tenant.create({ data: { name: 'Outra', slug: 'out' } })).id;

    // Uma linha de cada modelo, do tenant B. O client escopado em A não pode ver nenhuma.
    itinerarioB = (
      await base.itinerary.create({
        data: { tenantId: tenantB, name: 'Do B', slug: 'do-b', status: 'active' },
      })
    ).id;
    await base.itineraryPhoto.create({
      data: { tenantId: tenantB, itineraryId: itinerarioB, storagePath: 'b/1.webp', position: 0 },
    });
    await base.coupon.create({
      data: { tenantId: tenantB, code: 'SEGREDO-B', kind: 'percent', percent: 10 },
    });
    await base.supplierCategory.create({ data: { tenantId: tenantB, name: 'Hospedagem' } });
    await base.paymentIntegration.create({
      data: {
        tenantId: tenantB,
        provider: 'asaas',
        environment: 'sandbox',
        accessToken: 'cifrado-do-B',
        webhookToken: 'whk_segredo_do_B',
      },
    });
  });

  afterAll(async () => {
    await base.$disconnect();
  });

  it.each([
    ['itineraryPhoto', 'ItineraryPhoto'],
    ['coupon', 'Coupon'],
    ['supplierCategory', 'SupplierCategory'],
    ['paymentIntegration', 'PaymentIntegration'],
  ] as const)('findMany de %s escopado em A não traz linha de B', async (delegate) => {
    const scoped = tenantClient(base, tenantA) as unknown as Record<
      string,
      { findMany: () => Promise<{ tenantId: string }[]> }
    >;
    const rows = await scoped[delegate]!.findMany();
    expect(rows).toHaveLength(0);
  });

  it('a credencial do gateway de B não vaza para A — era o pior caso', async () => {
    const scoped = tenantClient(base, tenantA);

    // `findFirst` sem where: era exatamente assim que `find()` e `list()` liam o banco.
    expect(await scoped.paymentIntegration.findFirst({ where: { provider: 'asaas' } })).toBeNull();
    expect(await scoped.paymentIntegration.findMany()).toHaveLength(0);

    // E o webhook: o segredo de B, apresentado pela URL de A, não resolve integração nenhuma.
    expect(
      await scoped.paymentIntegration.findFirst({ where: { webhookToken: 'whk_segredo_do_B' } }),
    ).toBeNull();
  });

  it('A conectando o próprio gateway não sobrescreve a credencial de B', async () => {
    const scoped = tenantClient(base, tenantA);

    // O `upsert` do repositório busca por (provider, environment) — sem escopo, achava a
    // linha de B e a atualizava por id.
    await scoped.paymentIntegration.upsert({
      where: { id: '00000000-0000-4000-8000-000000000000' },
      update: { accessToken: 'cifrado-do-A' },
      create: {
        tenantId: tenantA,
        provider: 'asaas',
        environment: 'sandbox',
        accessToken: 'cifrado-do-A',
        webhookToken: 'whk_segredo_do_A',
      },
    });

    const deB = await base.paymentIntegration.findFirstOrThrow({ where: { tenantId: tenantB } });
    expect(deB.accessToken).toBe('cifrado-do-B');
  });

  it('deleteMany de A não apaga a integração de B', async () => {
    const scoped = tenantClient(base, tenantA);
    await scoped.paymentIntegration.deleteMany({ where: { provider: 'asaas' } });
    expect(await base.paymentIntegration.count({ where: { tenantId: tenantB } })).toBe(1);
  });

  it('delete por id de B, escopado em A, recusa em vez de apagar', async () => {
    const scoped = tenantClient(base, tenantA);
    const cupomB = await base.coupon.findFirstOrThrow({ where: { tenantId: tenantB } });
    await expect(scoped.coupon.delete({ where: { id: cupomB.id } })).rejects.toThrow();
    expect(await base.coupon.count({ where: { tenantId: tenantB } })).toBe(1);
  });

  it('findUnique por id de B, escopado em A, devolve null', async () => {
    const scoped = tenantClient(base, tenantA);
    const cupomB = await base.coupon.findFirstOrThrow({ where: { tenantId: tenantB } });
    expect(await scoped.coupon.findUnique({ where: { id: cupomB.id } })).toBeNull();
  });
});

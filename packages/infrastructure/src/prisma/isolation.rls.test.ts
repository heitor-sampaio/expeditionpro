import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from './client.js';
import { tenantClient } from './tenantClient.js';
import { resetSchema, testDatabaseUrl, TenantSession } from '../testkit/db.js';
import type { PrismaClient } from './client.js';

/**
 * A promessa multi-tenant só existe se estiver provada. Este é o teste que sustenta
 * o critério de pronto da Fase 0: o tenant A não enxerga dado do tenant B por
 * NENHUMA das duas vias (§2.2, SEC-02).
 */
describe('SEC-02: isolamento entre tenants', () => {
  let base: PrismaClient;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    await resetSchema();
    base = createPrismaClient(testDatabaseUrl());

    const a = await base.tenant.create({ data: { name: 'Drakkar', slug: 'drk' } });
    const b = await base.tenant.create({ data: { name: 'Outra', slug: 'out' } });
    tenantA = a.id;
    tenantB = b.id;

    await base.customer.create({
      data: {
        tenantId: tenantA,
        fullName: 'Cliente A',
        cpf: '90000010057',
        birthDate: new Date('1989-01-14'),
      },
    });
    await base.customer.create({
      data: {
        tenantId: tenantB,
        fullName: 'Cliente B',
        cpf: '12345678909',
        birthDate: new Date('1990-02-20'),
      },
    });
  });

  afterAll(async () => {
    await base.$disconnect();
  });

  it('via RLS: a sessão do tenant A só lê customers do próprio tenant', async () => {
    const session = await TenantSession.open(tenantA);
    try {
      const rows = await session.rows<{ tenant_id: string }>('SELECT tenant_id FROM customers');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tenant_id).toBe(tenantA);
    } finally {
      await session.close();
    }
  });

  it('via RLS: a sessão do tenant A não consegue inserir customer no tenant B (WITH CHECK)', async () => {
    const session = await TenantSession.open(tenantA);
    try {
      await expect(
        session.rows(
          'INSERT INTO customers (id, tenant_id, full_name, cpf, birth_date) VALUES (gen_random_uuid(), $1, $2, $3, $4)',
          [tenantB, 'Intruso', '11144477735', '2000-01-01'],
        ),
      ).rejects.toThrow();
    } finally {
      await session.close();
    }
  });

  it('via Prisma extension: o client escopado em A não retorna linha de B', async () => {
    const scoped = tenantClient(base, tenantA);
    const rows = await scoped.customer.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(tenantA);
  });

  it('via Prisma extension: findUnique por id de B, escopado em A, devolve null', async () => {
    const scoped = tenantClient(base, tenantA);
    const bCustomer = await base.customer.findFirstOrThrow({ where: { tenantId: tenantB } });
    const leaked = await scoped.customer.findUnique({ where: { id: bCustomer.id } });
    expect(leaked).toBeNull();
  });

  it('via Prisma extension: create injeta o tenant do contexto, ignorando tenant forjado no payload', async () => {
    const scoped = tenantClient(base, tenantA);
    const created = await scoped.customer.create({
      // tentativa de forjar outro tenant no payload
      data: {
        tenantId: tenantB,
        fullName: 'Forjado',
        cpf: '52998224725',
        birthDate: new Date('1995-05-05'),
      },
    });
    expect(created.tenantId).toBe(tenantA);
  });
});

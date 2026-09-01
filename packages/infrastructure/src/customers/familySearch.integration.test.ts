import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  registerCompanion,
  registerCustomer,
  searchCustomers,
  type RequestContext,
} from '@expedition/application';
import { createPrismaClient } from '../prisma/client.js';
import { prismaCustomerRepository } from './prismaCustomerRepository.js';
import { resetSchema, testDatabaseUrl } from '../testkit/db.js';
import type { PrismaClient } from '../prisma/client.js';

/**
 * CL-03 e CL-04 contra Postgres real: acompanhante persistido com responsible_id,
 * e a busca por nome (case-insensitive) ou CPF resolvendo a família inteira.
 */
describe('CL-03/CL-04: acompanhantes e busca de família (Prisma + Postgres real)', () => {
  let base: PrismaClient;
  let tenantId: string;
  const ctx = (): RequestContext => ({
    tenantId,
    actor: { kind: 'team', userId: '00000000-0000-0000-0000-000000000001', role: 'admin' },
  });

  beforeAll(async () => {
    await resetSchema();
    base = createPrismaClient(testDatabaseUrl());
    tenantId = (await base.tenant.create({ data: { name: 'Drakkar', slug: 'drk' } })).id;

    const repo = prismaCustomerRepository(base);
    const resp = await registerCustomer({ customers: repo }, ctx(), {
      fullName: 'Heitor Sampaio',
      cpf: '90000010057',
      birthDate: '1989-01-14',
      email: 'h@ex.com',
      phone: '48999998877',
    });
    await registerCompanion({ customers: repo }, ctx(), {
      responsibleId: resp.id,
      fullName: 'Fulana de Tal',
      cpf: '12345678909',
      birthDate: '2015-03-22',
    });
    await registerCompanion({ customers: repo }, ctx(), {
      responsibleId: resp.id,
      fullName: 'Beltrano de Tal',
      cpf: '52998224725',
      birthDate: '2018-07-09',
    });
  });

  afterAll(async () => {
    await base.$disconnect();
  });

  it('persiste o acompanhante apontando para o responsável', async () => {
    const repo = prismaCustomerRepository(base);
    const [family] = await searchCustomers({ customers: repo }, ctx(), {
      query: 'Heitor',
      sort: 'name',
    });
    expect(family?.responsible.responsibleId).toBeNull();
    expect(family?.companions).toHaveLength(2);
    for (const companion of family?.companions ?? []) {
      expect(companion.responsibleId).toBe(family?.responsible.id);
    }
  });

  it('busca por nome é case-insensitive e retorna a família (CL-04)', async () => {
    const repo = prismaCustomerRepository(base);
    const families = await searchCustomers({ customers: repo }, ctx(), {
      query: 'SAMPAIO',
      sort: 'name',
    });
    expect(families).toHaveLength(1);
    expect(families[0]?.companions).toHaveLength(2);
  });

  it('busca pelo CPF de um acompanhante retorna a família inteira (CL-04)', async () => {
    const repo = prismaCustomerRepository(base);
    const families = await searchCustomers({ customers: repo }, ctx(), {
      query: '529.982.247-25',
      sort: 'name',
    });
    expect(families).toHaveLength(1);
    expect(families[0]?.responsible.fullName).toBe('Heitor Sampaio');
    expect(families[0]?.companions).toHaveLength(2);
  });
});

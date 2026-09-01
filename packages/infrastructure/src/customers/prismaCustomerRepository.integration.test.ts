import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerCustomer, DuplicateCpfError, type RequestContext } from '@expedition/application';
import { parseCpf } from '@expedition/domain';
import { createPrismaClient } from '../prisma/client.js';
import { prismaCustomerRepository } from './prismaCustomerRepository.js';
import { resetSchema, testDatabaseUrl } from '../testkit/db.js';
import type { PrismaClient } from '../prisma/client.js';

/**
 * CL-01 ponta a ponta na camada de dados: o caso de uso sobre o repositório Prisma
 * REAL, contra Postgres. Cobre o mapeamento de datas, a unicidade por tenant
 * (UNIQUE (tenant_id, cpf)) e o isolamento — coisas que um fake não pega.
 */
describe('CL-01: persistência de cliente (Prisma + Postgres real)', () => {
  let base: PrismaClient;
  let tenantA: string;
  let tenantB: string;

  const ctx = (tenantId: string): RequestContext => ({
    tenantId,
    actor: { kind: 'team', userId: '00000000-0000-0000-0000-000000000001', role: 'admin' },
  });

  beforeAll(async () => {
    await resetSchema();
    base = createPrismaClient(testDatabaseUrl());
    tenantA = (await base.tenant.create({ data: { name: 'Drakkar', slug: 'drk' } })).id;
    tenantB = (await base.tenant.create({ data: { name: 'Outra', slug: 'out' } })).id;
  });

  afterAll(async () => {
    await base.$disconnect();
  });

  it('persiste o responsável e o recupera por CPF, com a data preservada', async () => {
    const repo = prismaCustomerRepository(base);
    const created = await registerCustomer({ customers: repo }, ctx(tenantA), {
      fullName: 'Heitor Sampaio',
      cpf: '900.000.100-57',
      birthDate: '1989-01-14',
      email: 'h@ex.com',
      phone: '48999998877',
    });

    expect(created.responsibleId).toBeNull();

    const found = await repo.findByCpf(tenantA, parseCpf('90000010057'));
    expect(found?.id).toBe(created.id);
    expect(found?.cpf).toBe('90000010057');
    expect(found?.birthDate).toEqual({ year: 1989, month: 1, day: 14 });
  });

  it('rejeita CPF duplicado no mesmo tenant (DuplicateCpfError antes do UNIQUE)', async () => {
    const repo = prismaCustomerRepository(base);
    const command = {
      fullName: 'Dup',
      cpf: '12345678909',
      birthDate: '1990-02-20',
      email: 'dup@ex.com',
      phone: '48999990000',
    };
    await registerCustomer({ customers: repo }, ctx(tenantA), command);
    await expect(registerCustomer({ customers: repo }, ctx(tenantA), command)).rejects.toThrow(
      DuplicateCpfError,
    );
  });

  it('o mesmo CPF em outro tenant é aceito, e um tenant não enxerga o cliente do outro', async () => {
    const repo = prismaCustomerRepository(base);
    const cpf = parseCpf('52998224725');
    await registerCustomer({ customers: repo }, ctx(tenantA), {
      fullName: 'Na A',
      cpf: '529.982.247-25',
      birthDate: '1985-05-05',
      email: 'a@ex.com',
      phone: '48991111111',
    });

    // mesmo CPF em B: permitido (unicidade é por tenant)
    const inB = await registerCustomer({ customers: repo }, ctx(tenantB), {
      fullName: 'Na B',
      cpf: '529.982.247-25',
      birthDate: '1985-05-05',
      email: 'b@ex.com',
      phone: '48992222222',
    });
    expect(inB.tenantId).toBe(tenantB);

    // B não enxerga o cliente de A, e vice-versa (escopo do tenantClient)
    const foundInB = await repo.findByCpf(tenantB, cpf);
    expect(foundInB?.fullName).toBe('Na B');
  });
});

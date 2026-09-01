import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseCpf, parseLocalDate } from '@expedition/domain';
import type { NewCustomer, RequestContext } from '@expedition/application';
import { createPrismaClient } from './client.js';
import { prismaUnitOfWork } from './prismaUnitOfWork.js';
import { prismaCustomerRepository } from '../customers/prismaCustomerRepository.js';
import { resetSchema, testDatabaseUrl } from '../testkit/db.js';
import type { PrismaClient } from './client.js';

/**
 * §5.7.2 — a alocação escreve numa transação única. Aqui provamos as duas garantias
 * do `prismaUnitOfWork` contra Postgres real: (1) se o `work` lança, TUDO volta atrás
 * — sem cliente órfão; (2) o escopo de tenant continua valendo dentro da transação
 * (proxy transacional do `tenantClient`), então um `find` cruzado não vaza.
 */
describe('IN-18/§5.7.2: transação única da alocação (Prisma + Postgres real)', () => {
  let base: PrismaClient;
  let tenantA: string;
  let tenantB: string;

  const ctx = (tenantId: string): RequestContext => ({
    tenantId,
    actor: { kind: 'team', userId: '00000000-0000-0000-0000-000000000001', role: 'admin' },
  });

  const newCustomer = (tenantId: string, cpf: string, fullName: string): NewCustomer => ({
    tenantId,
    responsibleId: null,
    fullName,
    cpf: parseCpf(cpf),
    birthDate: parseLocalDate('1989-01-14'),
    email: null,
    phone: null,
    address: {
      street: null,
      number: null,
      district: null,
      city: null,
      state: null,
      zip: null,
    },
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

  it('reverte tudo quando o work lança: o cliente criado no meio não persiste', async () => {
    const uow = prismaUnitOfWork(base);
    const cpf = parseCpf('90000010057');

    await expect(
      uow.run(ctx(tenantA), async (repos) => {
        await repos.customers.create(newCustomer(tenantA, '90000010057', 'Meio da transação'));
        throw new Error('falha depois de criar o cliente');
      }),
    ).rejects.toThrow('falha depois de criar o cliente');

    const after = await prismaCustomerRepository(base).findByCpf(tenantA, cpf);
    expect(after).toBeNull();
  });

  it('confirma tudo quando o work retorna: o cliente persiste', async () => {
    const uow = prismaUnitOfWork(base);
    const cpf = parseCpf('12345678909');

    const id = await uow.run(ctx(tenantA), async (repos) => {
      const created = await repos.customers.create(
        newCustomer(tenantA, '12345678909', 'Comprometido'),
      );
      return created.id;
    });

    const after = await prismaCustomerRepository(base).findByCpf(tenantA, cpf);
    expect(after?.id).toBe(id);
  });

  it('§2.2: dentro da transação o escopo de tenant vale — find cruzado não vaza', async () => {
    const uow = prismaUnitOfWork(base);
    const cpf = parseCpf('52998224725');

    const crossTenant = await uow.run(ctx(tenantA), async (repos) => {
      const created = await repos.customers.create(newCustomer(tenantA, '52998224725', 'Só do A'));
      expect(created.tenantId).toBe(tenantA);
      // o mesmo CPF, olhado pelo tenant B, não existe: o proxy escopa na própria tx
      return repos.customers.findByCpf(tenantB, cpf);
    });

    expect(crossTenant).toBeNull();
  });
});

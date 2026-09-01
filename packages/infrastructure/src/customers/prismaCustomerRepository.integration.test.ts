import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  registerCustomer,
  DuplicateCpfError,
  EMPTY_ADDRESS,
  type RequestContext,
} from '@expedition/application';
import { parseCpf, searchKey } from '@expedition/domain';
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

describe('CL-02: busca por nome sem acento (Prisma + Postgres real)', () => {
  let base: PrismaClient;
  let tenantId: string;

  beforeAll(async () => {
    await resetSchema();
    base = createPrismaClient(testDatabaseUrl());
    tenantId = (await base.tenant.create({ data: { name: 'Drakkar', slug: 'drk' } })).id;
  });

  afterAll(async () => {
    await base.$disconnect();
  });

  it('acha "João" digitando "joao", e o contrário também', async () => {
    const repo = prismaCustomerRepository(base);
    await repo.create({
      tenantId,
      responsibleId: null,
      fullName: 'João Gonçalves',
      cpf: parseCpf('900.000.100-57'),
      birthDate: '1985-04-02',
      email: null,
      phone: null,
      address: EMPTY_ADDRESS,
    });

    /*
     * O fake sempre tirou acento; o Prisma não tirava. A busca passava no teste e falhava
     * na tela — por isso a prova tem de ser contra Postgres, não contra o fake.
     */
    for (const digitado of ['joao', 'João', 'GONCALVES', 'gonçalves']) {
      const achados = await repo.search(tenantId, digitado, 'name');
      expect(achados.map((c) => c.fullName)).toEqual(['João Gonçalves']);
    }
  });
});

describe('CL-02: a normalização do TypeScript e a do Postgres não podem divergir', () => {
  let base: PrismaClient;
  let tenantId: string;

  beforeAll(async () => {
    await resetSchema();
    base = createPrismaClient(testDatabaseUrl());
    tenantId = (await base.tenant.create({ data: { name: 'Drakkar', slug: 'drk' } })).id;
  });

  afterAll(async () => {
    await base.$disconnect();
  });

  /*
   * O termo digitado é normalizado em TypeScript (`searchKey`); o valor guardado, por uma
   * coluna gerada em SQL. Duas definições da mesma coisa — e o modo de divergir é o pior
   * possível, porque a busca passa a errar em silêncio.
   *
   * Este teste é a junta: grava um nome com cada letra acentuada do português e confere
   * que o Postgres chegou exatamente onde o TypeScript chega.
   */
  it('as duas concordam letra por letra no alfabeto português', async () => {
    const nome = 'Áàâãä Éèêë Íìîï Óòôõö Úùûü Çç Ññ Joao';
    const criado = await base.customer.create({
      data: {
        tenantId,
        fullName: nome,
        cpf: '90000010057',
        birthDate: new Date('1990-01-01'),
        addressStreet: '',
        addressNumber: '',
        addressDistrict: '',
        addressCity: '',
        addressState: '',
        addressZip: '',
      },
      select: { searchName: true },
    });

    expect(criado.searchName).toBe(searchKey(nome));
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NewSupplier, SupplierPatch } from '@expedition/application';
import { createPrismaClient } from '../prisma/client.js';
import { prismaSupplierRepository } from './prismaSupplierRepository.js';
import { resetSchema, testDatabaseUrl } from '../testkit/db.js';
import type { PrismaClient } from '../prisma/client.js';

/**
 * FO-01 · FO-07 na camada de dados: o repositório Prisma REAL contra Postgres, indo e
 * voltando. É o teste que faltava quando a chave PIX gravou NULL — o `data` do Prisma não
 * a citava, o mapper de leitura citava, e nada na suíte tocava esse ponto porque os testes
 * de rota rodam em repositório de memória.
 *
 * Ida e volta pega o que um teste de payload não pega: coluna com outro nome, valor
 * convertido errado e campo que o banco recusa em silêncio.
 */
describe('FO-01 · FO-07: persistência de fornecedor (Prisma + Postgres real)', () => {
  let base: PrismaClient;
  let tenantId: string;

  const novo = (over: Partial<NewSupplier> = {}): NewSupplier => ({
    tenantId,
    name: 'Fazenda do Barreiro',
    doc: '19131243000197',
    docType: 'cnpj',
    pixKey: 'contato@fazenda.com.br',
    pixKeyType: 'email',
    phone: '5548999998888',
    email: 'contato@fazenda.com.br',
    notes: 'Pernoite e café',
    categoryId: null,
    ...over,
  });

  beforeAll(async () => {
    await resetSchema();
    base = createPrismaClient(testDatabaseUrl());
    tenantId = (await base.tenant.create({ data: { name: 'Drakkar', slug: 'drk' } })).id;
  });

  afterAll(async () => {
    await base.$disconnect();
  });

  it('grava todo campo do port e o devolve na releitura', async () => {
    const repo = prismaSupplierRepository(base);
    const criado = await repo.createSupplier(novo());

    // Releitura, não o retorno do create: é o banco que precisa ter guardado.
    const lido = await repo.findSupplierById(tenantId, criado.id);
    expect(lido).toMatchObject({
      name: 'Fazenda do Barreiro',
      doc: '19131243000197',
      docType: 'cnpj',
      pixKey: 'contato@fazenda.com.br',
      pixKeyType: 'email',
      phone: '5548999998888',
      email: 'contato@fazenda.com.br',
      notes: 'Pernoite e café',
    });
  });

  it('FO-07: a chave PIX sobrevive à edição', async () => {
    const repo = prismaSupplierRepository(base);
    const criado = await repo.createSupplier(novo({ doc: '52998224725', docType: 'cpf' }));

    const patch: SupplierPatch = {
      name: 'Fazenda do Barreiro',
      doc: '52998224725',
      docType: 'cpf',
      pixKey: '5548999998888',
      pixKeyType: 'phone',
      phone: null,
      email: null,
      notes: null,
      categoryId: null,
    };
    await repo.updateSupplier(tenantId, criado.id, patch);

    const lido = await repo.findSupplierById(tenantId, criado.id);
    expect(lido?.pixKey).toBe('5548999998888');
    expect(lido?.pixKeyType).toBe('phone');
  });

  it('FO-07: chave em branco limpa chave e tipo juntos', async () => {
    const repo = prismaSupplierRepository(base);
    const criado = await repo.createSupplier(novo({ doc: null, docType: null }));

    await repo.updateSupplier(tenantId, criado.id, {
      name: criado.name,
      doc: null,
      docType: null,
      pixKey: null,
      pixKeyType: null,
      phone: null,
      email: null,
      notes: null,
      categoryId: null,
    });

    const lido = await repo.findSupplierById(tenantId, criado.id);
    expect(lido?.pixKey).toBeNull();
    expect(lido?.pixKeyType).toBeNull();
  });

  it('FO-04: a categoria é resolvida por junção na leitura', async () => {
    const repo = prismaSupplierRepository(base);
    const categoria = await repo.createCategory({ tenantId, name: 'Hospedagem' });
    const criado = await repo.createSupplier(novo({ doc: null, categoryId: categoria.id }));

    const lido = await repo.findSupplierById(tenantId, criado.id);
    expect(lido?.categoryId).toBe(categoria.id);
    expect(lido?.categoryName).toBe('Hospedagem');

    // Renomear alcança o histórico — é a decisão "a categoria é do fornecedor" (FO-05).
    await repo.renameCategory(tenantId, categoria.id, 'Pernoite');
    expect((await repo.findSupplierById(tenantId, criado.id))?.categoryName).toBe('Pernoite');
  });
});

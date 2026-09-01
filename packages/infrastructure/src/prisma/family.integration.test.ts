import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from './client.js';
import { tenantClient } from './tenantClient.js';
import { resetSchema, testDatabaseUrl } from '../testkit/db.js';
import type { PrismaClient } from './client.js';

/**
 * A hierarquia familiar tem exatamente dois níveis (CL-11 · §3.2). Garantido por
 * trigger, não só por validação de formulário — por isso o teste toca o banco real.
 */
describe('CL-11: hierarquia familiar de dois níveis', () => {
  let base: PrismaClient;
  let tenantId: string;

  beforeAll(async () => {
    await resetSchema();
    base = createPrismaClient(testDatabaseUrl());
    const t = await base.tenant.create({ data: { name: 'Drakkar', slug: 'drk' } });
    tenantId = t.id;
  });

  afterAll(async () => {
    await base.$disconnect();
  });

  it('permite responsável com acompanhante (dois níveis)', async () => {
    const db = tenantClient(base, tenantId);
    const resp = await db.customer.create({
      data: {
        tenantId,
        fullName: 'Responsável',
        cpf: '90000010057',
        birthDate: new Date('1989-01-14'),
      },
    });
    const comp = await db.customer.create({
      data: {
        tenantId,
        fullName: 'Acompanhante',
        cpf: '12345678909',
        birthDate: new Date('2015-03-22'),
        responsibleId: resp.id,
      },
    });
    expect(comp.responsibleId).toBe(resp.id);
  });

  it('bloqueia acompanhante de acompanhante (terceiro nível)', async () => {
    const db = tenantClient(base, tenantId);
    const resp = await db.customer.create({
      data: { tenantId, fullName: 'Chefe', cpf: '11144477735', birthDate: new Date('1980-01-01') },
    });
    const comp = await db.customer.create({
      data: {
        tenantId,
        fullName: 'Dependente',
        cpf: '52998224725',
        birthDate: new Date('2016-02-29'),
        responsibleId: resp.id,
      },
    });
    await expect(
      db.customer.create({
        data: {
          tenantId,
          fullName: 'Neto',
          cpf: '15350946056',
          birthDate: new Date('2020-06-01'),
          responsibleId: comp.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('bloqueia transformar um responsável com dependentes em acompanhante (não cria órfão)', async () => {
    const db = tenantClient(base, tenantId);
    const respA = await db.customer.create({
      data: { tenantId, fullName: 'Pai', cpf: '20202020202', birthDate: new Date('1975-01-01') },
    });
    const other = await db.customer.create({
      data: {
        tenantId,
        fullName: 'Outro responsável',
        cpf: '30303030303',
        birthDate: new Date('1978-01-01'),
      },
    });
    await db.customer.create({
      data: {
        tenantId,
        fullName: 'Filho',
        cpf: '40404040404',
        birthDate: new Date('2018-07-09'),
        responsibleId: respA.id,
      },
    });
    await expect(
      db.customer.update({ where: { id: respA.id }, data: { responsibleId: other.id } }),
    ).rejects.toThrow();
  });
});

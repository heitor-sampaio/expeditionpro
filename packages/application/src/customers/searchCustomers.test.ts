import { describe, it, expect } from 'vitest';
import { registerCustomer } from './registerCustomer.js';
import { registerCompanion } from './registerCompanion.js';
import { searchCustomers } from './searchCustomers.js';
import { fakeCustomerRepository } from './customerRepository.fake.js';
import type { CustomerRepository } from './customerRepository.js';
import type { RequestContext } from '../context.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

async function familyOfThree(customers: CustomerRepository) {
  const resp = await registerCustomer({ customers }, ctx, {
    fullName: 'Heitor Sampaio',
    cpf: '90000010057',
    birthDate: '1989-01-14',
    email: 'h@ex.com',
    phone: '48999998877',
  });
  const comp1 = await registerCompanion({ customers }, ctx, {
    responsibleId: resp.id,
    fullName: 'Fulana de Tal',
    cpf: '12345678909',
    birthDate: '2015-03-22',
  });
  const comp2 = await registerCompanion({ customers }, ctx, {
    responsibleId: resp.id,
    fullName: 'Beltrano de Tal',
    cpf: '52998224725',
    birthDate: '2018-07-09',
  });
  return { resp, comp1, comp2 };
}

describe('CL-04: busca por nome, CPF ou telefone retorna a família inteira', () => {
  it('busca pelo nome do responsável e devolve responsável + acompanhantes', async () => {
    const customers = fakeCustomerRepository();
    const { resp, comp1, comp2 } = await familyOfThree(customers);

    const families = await searchCustomers({ customers }, ctx, { query: 'sampaio', sort: 'name' });

    expect(families).toHaveLength(1);
    expect(families[0]?.responsible.id).toBe(resp.id);
    expect(families[0]?.companions.map((c) => c.id).sort()).toEqual([comp1.id, comp2.id].sort());
  });

  it('busca pelo CPF de um ACOMPANHANTE e ainda devolve a família toda', async () => {
    const customers = fakeCustomerRepository();
    const { resp, comp1, comp2 } = await familyOfThree(customers);

    const families = await searchCustomers({ customers }, ctx, {
      query: '529.982.247-25',
      sort: 'name',
    });

    expect(families).toHaveLength(1);
    expect(families[0]?.responsible.id).toBe(resp.id);
    expect(families[0]?.companions.map((c) => c.id).sort()).toEqual([comp1.id, comp2.id].sort());
  });

  it('busca pelo TELEFONE do responsável', async () => {
    const customers = fakeCustomerRepository();
    const { resp } = await familyOfThree(customers);

    const families = await searchCustomers({ customers }, ctx, { query: '48999', sort: 'name' });

    expect(families).toHaveLength(1);
    expect(families[0]?.responsible.id).toBe(resp.id);
  });

  it('vários membros batendo na busca colapsam em uma família só', async () => {
    const customers = fakeCustomerRepository();
    await familyOfThree(customers);

    const families = await searchCustomers({ customers }, ctx, { query: 'de Tal', sort: 'name' });

    expect(families).toHaveLength(1);
    expect(families[0]?.companions).toHaveLength(2);
  });

  it('sem correspondência devolve lista vazia', async () => {
    const customers = fakeCustomerRepository();
    await familyOfThree(customers);
    expect(
      await searchCustomers({ customers }, ctx, { query: 'inexistente', sort: 'name' }),
    ).toEqual([]);
  });

  it('query vazia lista TODAS as famílias', async () => {
    const customers = fakeCustomerRepository();
    await familyOfThree(customers);
    await registerCustomer({ customers }, ctx, {
      fullName: 'Ana Zorzi',
      cpf: '39053344705',
      birthDate: '1990-05-05',
      email: 'ana@ex.com',
      phone: '5133334444',
    });

    const families = await searchCustomers({ customers }, ctx, { query: '', sort: 'name' });
    expect(families).toHaveLength(2); // duas famílias (não conta acompanhantes como famílias)
  });

  it('ordena por nome (A→Z) ou por criação (mais recente primeiro)', async () => {
    const customers = fakeCustomerRepository();
    // "Ana" criada primeiro, "Heitor..." depois.
    await registerCustomer({ customers }, ctx, {
      fullName: 'Ana Zorzi',
      cpf: '39053344705',
      birthDate: '1990-05-05',
      email: 'ana@ex.com',
      phone: '5133334444',
    });
    await familyOfThree(customers); // Heitor Sampaio

    const byName = await searchCustomers({ customers }, ctx, { query: '', sort: 'name' });
    expect(byName.map((f) => f.responsible.fullName)).toEqual(['Ana Zorzi', 'Heitor Sampaio']);

    const byCreated = await searchCustomers({ customers }, ctx, { query: '', sort: 'created' });
    expect(byCreated.map((f) => f.responsible.fullName)).toEqual(['Heitor Sampaio', 'Ana Zorzi']);
  });
});

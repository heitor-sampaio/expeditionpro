import { describe, it, expect } from 'vitest';
import { InvalidCpfError } from '@expedition/domain';
import { RequiredFieldError } from '../errors.js';
import { registerCustomer } from './registerCustomer.js';
import { DuplicateCpfError } from './errors.js';
import { fakeCustomerRepository as fakeRepo } from './customerRepository.fake.js';
import type { RequestContext } from '../context.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

describe('CL-01: cadastro de cliente responsável', () => {
  it('cria o responsável com CPF normalizado, responsible_id nulo e id atribuído', async () => {
    const customers = fakeRepo();
    const created = await registerCustomer({ customers }, ctx, {
      fullName: 'heitor sampaio', // será normalizado para "Heitor Sampaio"
      cpf: '900.000.100-57',
      birthDate: '1989-01-14',
      email: 'h@ex.com',
      phone: '(48) 99999-8877',
    });

    expect(created.id).toBe('cust-1');
    expect(created.tenantId).toBe('tenant-a');
    expect(created.responsibleId).toBeNull();
    expect(created.fullName).toBe('Heitor Sampaio'); // nome normalizado (CL-01)
    expect(created.cpf).toBe('90000010057'); // normalizado, só dígitos
    expect(created.birthDate).toEqual({ year: 1989, month: 1, day: 14 });
    expect(created.email).toBe('h@ex.com');
    expect(created.phone).toBe('5548999998877'); // E.164 (§3.2)
  });

  it('rejeita CPF inválido antes de tocar o repositório (CL-01)', async () => {
    const customers = fakeRepo();
    await expect(
      registerCustomer({ customers }, ctx, {
        fullName: 'Fulano',
        cpf: '90000010000',
        birthDate: '1989-01-14',
      }),
    ).rejects.toThrow(InvalidCpfError);
    expect(customers.rows).toHaveLength(0);
  });

  it('rejeita CPF já existente no tenant (DuplicateCpfError)', async () => {
    const customers = fakeRepo();
    const command = {
      fullName: 'Heitor',
      cpf: '90000010057',
      birthDate: '1989-01-14',
      email: 'h@ex.com',
      phone: '48999998877',
    };
    await registerCustomer({ customers }, ctx, command);
    await expect(registerCustomer({ customers }, ctx, command)).rejects.toThrow(DuplicateCpfError);
    expect(customers.rows).toHaveLength(1);
  });

  it('o mesmo CPF em outro tenant é permitido (unicidade é por tenant)', async () => {
    const customers = fakeRepo();
    const command = {
      fullName: 'Heitor',
      cpf: '90000010057',
      birthDate: '1989-01-14',
      email: 'h@ex.com',
      phone: '48999998877',
    };
    await registerCustomer({ customers }, ctx, command);
    const otherTenant: RequestContext = { ...ctx, tenantId: 'tenant-b' };
    const created = await registerCustomer({ customers }, otherTenant, command);
    expect(created.tenantId).toBe('tenant-b');
    expect(customers.rows).toHaveLength(2);
  });

  it('exige e-mail e telefone do responsável (§3.2), sem persistir nada', async () => {
    const customers = fakeRepo();
    const base = { fullName: 'Heitor', cpf: '90000010057', birthDate: '1989-01-14' };

    await expect(
      registerCustomer({ customers }, ctx, { ...base, phone: '48999998877' }),
    ).rejects.toThrow(RequiredFieldError); // sem e-mail
    await expect(
      registerCustomer({ customers }, ctx, { ...base, email: 'h@ex.com' }),
    ).rejects.toThrow(RequiredFieldError); // sem telefone
    expect(customers.rows).toHaveLength(0);
  });

  it('faz trim do nome', async () => {
    const customers = fakeRepo();
    const created = await registerCustomer({ customers }, ctx, {
      fullName: '  Heitor  ',
      cpf: '90000010057',
      birthDate: '1989-01-14',
      email: 'h@ex.com',
      phone: '48999998877',
    });
    expect(created.fullName).toBe('Heitor');
  });

  const CONTACT = { email: 'h@ex.com', phone: '48999998877' };

  it('guarda o endereço fiscal quando informado, com CEP normalizado (CL-02)', async () => {
    const customers = fakeRepo();
    const created = await registerCustomer({ customers }, ctx, {
      fullName: 'Heitor',
      cpf: '90000010057',
      birthDate: '1989-01-14',
      ...CONTACT,
      address: {
        street: 'Rua Luiz Pasteur',
        number: '509',
        district: 'Trindade',
        city: 'Florianópolis',
        state: 'SC',
        zip: '88036-100',
      },
    });
    expect(created.address).toEqual({
      street: 'Rua Luiz Pasteur',
      number: '509',
      district: 'Trindade',
      city: 'Florianópolis',
      state: 'SC',
      zip: '88036100', // normalizado
    });
  });

  it('sem endereço, os campos ficam nulos (opcional, §3.8)', async () => {
    const customers = fakeRepo();
    const created = await registerCustomer({ customers }, ctx, {
      fullName: 'Heitor',
      cpf: '90000010057',
      birthDate: '1989-01-14',
      ...CONTACT,
    });
    expect(created.address).toEqual({
      street: null,
      number: null,
      district: null,
      city: null,
      state: null,
      zip: null,
    });
  });
});

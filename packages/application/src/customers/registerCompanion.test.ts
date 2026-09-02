import { describe, it, expect } from 'vitest';
import { NotFoundError, BusinessRuleError } from '../errors.js';
import { DuplicateCpfError } from './errors.js';
import { registerCustomer } from './registerCustomer.js';
import { registerCompanion } from './registerCompanion.js';
import { fakeCustomerRepository } from './customerRepository.fake.js';
import type { RequestContext } from '../context.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const RESPONSIBLE = {
  fullName: 'Heitor Sampaio',
  cpf: '90000010057',
  birthDate: '1989-01-14',
  email: 'h@ex.com',
  phone: '48999998877',
};

describe('CL-03: adicionar acompanhante à família', () => {
  it('cria o acompanhante apontando para o responsável, exigindo só nome, CPF e nascimento', async () => {
    const customers = fakeCustomerRepository();
    const resp = await registerCustomer({ customers }, ctx, RESPONSIBLE);

    const comp = await registerCompanion({ customers }, ctx, {
      responsibleId: resp.id,
      fullName: 'Fulana de Tal',
      cpf: '12345678909',
      birthDate: '2015-03-22',
    });

    expect(comp.responsibleId).toBe(resp.id);
    expect(comp.cpf).toBe('12345678909');
    expect(comp.email).toBeNull(); // opcional no acompanhante (§3.2)
    expect(comp.phone).toBeNull();
  });

  it('rejeita se o responsável não existe (NotFoundError)', async () => {
    const customers = fakeCustomerRepository();
    await expect(
      registerCompanion({ customers }, ctx, {
        responsibleId: 'inexistente',
        fullName: 'X',
        cpf: '12345678909',
        birthDate: '2015-03-22',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejeita anexar acompanhante a outro acompanhante (dois níveis, CL-11)', async () => {
    const customers = fakeCustomerRepository();
    const resp = await registerCustomer({ customers }, ctx, RESPONSIBLE);
    const comp = await registerCompanion({ customers }, ctx, {
      responsibleId: resp.id,
      fullName: 'Fulana',
      cpf: '12345678909',
      birthDate: '2015-03-22',
    });
    await expect(
      registerCompanion({ customers }, ctx, {
        responsibleId: comp.id, // apontando para um acompanhante
        fullName: 'Neto',
        cpf: '52998224725',
        birthDate: '2020-06-01',
      }),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('rejeita CPF já usado no tenant (DuplicateCpfError)', async () => {
    const customers = fakeCustomerRepository();
    const resp = await registerCustomer({ customers }, ctx, RESPONSIBLE);
    await expect(
      registerCompanion({ customers }, ctx, {
        responsibleId: resp.id,
        fullName: 'Clone',
        cpf: '900.000.100-57', // mesmo CPF do responsável
        birthDate: '2015-03-22',
      }),
    ).rejects.toThrow(DuplicateCpfError);
  });

  it('respeita o limite de acompanhantes (default 4)', async () => {
    const customers = fakeCustomerRepository();
    const resp = await registerCustomer({ customers }, ctx, RESPONSIBLE);
    const cpfs = ['12345678909', '52998224725', '15350946056', '11144477735'];
    for (const cpf of cpfs) {
      await registerCompanion({ customers }, ctx, {
        responsibleId: resp.id,
        fullName: 'Acomp',
        cpf,
        birthDate: '2015-03-22',
      });
    }
    await expect(
      registerCompanion({ customers }, ctx, {
        responsibleId: resp.id,
        fullName: 'Quinto',
        cpf: '39053344705',
        birthDate: '2015-03-22',
      }),
    ).rejects.toThrow(BusinessRuleError);
  });
});

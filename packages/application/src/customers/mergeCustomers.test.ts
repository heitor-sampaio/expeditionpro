import { describe, it, expect } from 'vitest';
import { parsePlate } from '@expedition/domain';
import { NotFoundError, BusinessRuleError } from '../errors.js';
import { registerCustomer } from './registerCustomer.js';
import { registerCompanion } from './registerCompanion.js';
import { mergeCustomers } from './mergeCustomers.js';
import { fakeCustomerRepository } from './customerRepository.fake.js';
import { fakeVehicleRepository } from '../vehicles/vehicleRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import type { RequestContext } from '../context.js';

const audit = fakeAuditLogRepository();

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
const contact = { email: 'x@ex.com', phone: '48999998877' };

async function setup() {
  const customers = fakeCustomerRepository();
  const vehicles = fakeVehicleRepository();
  const survivor = await registerCustomer({ customers }, ctx, {
    fullName: 'Sobrevivente',
    cpf: '90000010057',
    birthDate: '1980-01-01',
    ...contact,
  });
  const duplicate = await registerCustomer({ customers }, ctx, {
    fullName: 'Duplicado',
    cpf: '12345678909',
    birthDate: '1980-01-01',
    ...contact,
  });
  const dupCompanion = await registerCompanion({ customers }, ctx, {
    responsibleId: duplicate.id,
    fullName: 'Filho do duplicado',
    cpf: '52998224725',
    birthDate: '2015-03-22',
  });
  const dupVehicle = await vehicles.createVehicle({
    tenantId: ctx.tenantId,
    customerId: duplicate.id,
    brandId: null,
    modelId: null,
    brandOther: null,
    modelOther: null,
    needsCatalogReview: false,
    plate: parsePlate('ABC1234'),
    year: null,
    color: null,
  });
  return { customers, vehicles, survivor, duplicate, dupCompanion, dupVehicle };
}

describe('CL-07: merge de clientes duplicados', () => {
  it('reatribui veículos e acompanhantes do duplicado ao sobrevivente e apaga o duplicado', async () => {
    const { customers, vehicles, survivor, duplicate, dupCompanion, dupVehicle } = await setup();

    await mergeCustomers({ customers, vehicles, audit }, ctx, {
      survivorId: survivor.id,
      duplicateId: duplicate.id,
    });

    expect(vehicles.vehicles.find((v) => v.id === dupVehicle.id)?.customerId).toBe(survivor.id);
    const companionAfter = await customers.findById(ctx.tenantId, dupCompanion.id);
    expect(companionAfter?.responsibleId).toBe(survivor.id);
    expect(await customers.findById(ctx.tenantId, duplicate.id)).toBeNull();
  });

  it('rejeita merge de um cliente com ele mesmo', async () => {
    const { customers, vehicles, survivor } = await setup();
    await expect(
      mergeCustomers({ customers, vehicles, audit }, ctx, {
        survivorId: survivor.id,
        duplicateId: survivor.id,
      }),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('rejeita quando o sobrevivente ou o duplicado não existe', async () => {
    const { customers, vehicles, survivor } = await setup();
    await expect(
      mergeCustomers({ customers, vehicles, audit }, ctx, {
        survivorId: survivor.id,
        duplicateId: 'nao-existe',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejeita quando o duplicado tem acompanhantes mas o sobrevivente é um acompanhante (evita 3 níveis)', async () => {
    const { customers, vehicles, duplicate } = await setup();
    // cria um responsável e um acompanhante para ser o "sobrevivente" acompanhante
    const resp = await registerCustomer({ customers }, ctx, {
      fullName: 'Resp',
      cpf: '39053344705',
      birthDate: '1980-01-01',
      ...contact,
    });
    const survivorCompanion = await registerCompanion({ customers }, ctx, {
      responsibleId: resp.id,
      fullName: 'Acomp sobrevivente',
      cpf: '15350946056',
      birthDate: '2015-03-22',
    });
    await expect(
      mergeCustomers({ customers, vehicles, audit }, ctx, {
        survivorId: survivorCompanion.id,
        duplicateId: duplicate.id, // tem acompanhante
      }),
    ).rejects.toThrow(BusinessRuleError);
  });
});

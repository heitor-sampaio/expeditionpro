import { describe, it, expect } from 'vitest';
import { InvalidPlateError } from '@expedition/domain';
import { NotFoundError, BusinessRuleError } from '../errors.js';
import { registerCustomer } from '../customers/registerCustomer.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { saveVehicle } from './saveVehicle.js';
import { fakeVehicleRepository } from './vehicleRepository.fake.js';
import type { RequestContext } from '../context.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const CATALOG = {
  brands: [{ id: 'brand-ford', name: 'Ford' }],
  models: [{ id: 'model-ranger', brandId: 'brand-ford', name: 'Ranger' }],
};

async function aCustomer(customers: ReturnType<typeof fakeCustomerRepository>) {
  const resp = await registerCustomer({ customers }, ctx, {
    fullName: 'Heitor',
    cpf: '90000010057',
    birthDate: '1989-01-14',
    email: 'h@ex.com',
    phone: '48999998877',
  });
  return resp.id;
}

describe('CL-05: salvar veículo do cliente', () => {
  it('salva com marca e modelo do catálogo, placa validada', async () => {
    const customers = fakeCustomerRepository();
    const vehicles = fakeVehicleRepository(CATALOG);
    const customerId = await aCustomer(customers);

    const vehicle = await saveVehicle({ customers, vehicles }, ctx, {
      customerId,
      brandId: 'brand-ford',
      modelId: 'model-ranger',
      plate: 'abc1d23',
    });

    expect(vehicle.brandId).toBe('brand-ford');
    expect(vehicle.modelId).toBe('model-ranger');
    expect(vehicle.brandOther).toBeNull();
    expect(vehicle.needsCatalogReview).toBe(false);
    expect(vehicle.plate).toBe('ABC1D23'); // normalizada
  });

  it('marca "Outro" grava brand_other e marca needs_catalog_review (§3.3)', async () => {
    const customers = fakeCustomerRepository();
    const vehicles = fakeVehicleRepository(CATALOG);
    const customerId = await aCustomer(customers);

    const vehicle = await saveVehicle({ customers, vehicles }, ctx, {
      customerId,
      brandOther: 'Gurgel',
      modelOther: 'Carajás',
      plate: 'ABC1234',
    });

    expect(vehicle.brandId).toBeNull();
    expect(vehicle.brandOther).toBe('Gurgel');
    expect(vehicle.modelOther).toBe('Carajás');
    expect(vehicle.needsCatalogReview).toBe(true);
  });

  it('rejeita placa inválida (InvalidPlateError)', async () => {
    const customers = fakeCustomerRepository();
    const vehicles = fakeVehicleRepository(CATALOG);
    const customerId = await aCustomer(customers);
    await expect(
      saveVehicle({ customers, vehicles }, ctx, { customerId, plate: 'XX' }),
    ).rejects.toThrow(InvalidPlateError);
  });

  it('rejeita cliente inexistente (NotFoundError)', async () => {
    const customers = fakeCustomerRepository();
    const vehicles = fakeVehicleRepository(CATALOG);
    await expect(
      saveVehicle({ customers, vehicles }, ctx, { customerId: 'nao-existe', plate: 'ABC1234' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejeita marca fora do catálogo do tenant (NotFoundError)', async () => {
    const customers = fakeCustomerRepository();
    const vehicles = fakeVehicleRepository(CATALOG);
    const customerId = await aCustomer(customers);
    await expect(
      saveVehicle({ customers, vehicles }, ctx, {
        customerId,
        brandId: 'nao-existe',
        plate: 'ABC1234',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejeita modelo que não pertence à marca escolhida (BusinessRuleError)', async () => {
    const customers = fakeCustomerRepository();
    const vehicles = fakeVehicleRepository({
      brands: [
        { id: 'brand-ford', name: 'Ford' },
        { id: 'brand-fiat', name: 'Fiat' },
      ],
      models: [{ id: 'model-toro', brandId: 'brand-fiat', name: 'Toro' }],
    });
    const customerId = await aCustomer(customers);
    await expect(
      saveVehicle({ customers, vehicles }, ctx, {
        customerId,
        brandId: 'brand-ford',
        modelId: 'model-toro', // é da Fiat
        plate: 'ABC1234',
      }),
    ).rejects.toThrow(BusinessRuleError);
  });
});

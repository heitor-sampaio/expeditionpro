import { describe, expect, it } from 'vitest';
import { parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeVehicleRepository } from './vehicleRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { saveVehicle } from './saveVehicle.js';
import { listCustomerVehicles } from './listCustomerVehicles.js';
import { updateVehicle } from './updateVehicle.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import type { RequestContext } from '../context.js';

/**
 * CL-05 — o veículo da família muda (vendeu o carro, trocou a placa). Listar e editar
 * completam o que já existia (anexar). Escopo de família: a equipe gere o tenant, o
 * cliente só a própria família — o mesmo guarda da escrita do portal (PC-06).
 */

const team: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const BRANDS = [
  { id: 'brand-jeep', name: 'Jeep' },
  { id: 'brand-ford', name: 'Ford' },
];
const MODELS = [
  { id: 'model-wrangler', brandId: 'brand-jeep', name: 'Wrangler' },
  { id: 'model-ranger', brandId: 'brand-ford', name: 'Ranger' },
];

async function seed() {
  const customers = fakeCustomerRepository();
  const vehicles = fakeVehicleRepository({ brands: BRANDS, models: MODELS });
  const head = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: null,
    fullName: 'Ana Prado',
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate('1988-03-04'),
    email: 'ana@example.com',
    phone: '5548999990000',
    address: EMPTY_ADDRESS,
  });
  const vehicle = await saveVehicle({ customers, vehicles }, team, {
    customerId: head.id,
    brandId: 'brand-jeep',
    modelId: 'model-wrangler',
    plate: 'ABC1D23',
  });
  return { customers, vehicles, head, vehicle };
}

describe('CL-05: veículos do cliente — listar', () => {
  it('lista os veículos do cliente', async () => {
    const { customers, vehicles, head, vehicle } = await seed();
    const list = await listCustomerVehicles({ customers, vehicles }, team, {
      customerId: head.id,
    });
    expect(list.map((v) => v.id)).toEqual([vehicle.id]);
    expect(list[0]!.plate).toBe('ABC1D23');
  });

  it('o cliente não lê a família de outro', async () => {
    const { customers, vehicles, head } = await seed();
    const outsider = await customers.create({
      tenantId: 'tenant-a',
      responsibleId: null,
      fullName: 'De Fora',
      cpf: parseCpf('900.000.100-57'),
      birthDate: parseLocalDate('1990-01-01'),
      email: 'fora@example.com',
      phone: '5548999990001',
      address: EMPTY_ADDRESS,
    });
    const outsiderCtx: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', customerId: outsider.id, userId: 'cust-2' },
    };
    await expect(
      listCustomerVehicles({ customers, vehicles }, outsiderCtx, { customerId: head.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('CL-05: veículos do cliente — editar', () => {
  it('troca placa, marca e modelo pelo catálogo', async () => {
    const { customers, vehicles, vehicle } = await seed();
    const updated = await updateVehicle({ customers, vehicles }, team, {
      vehicleId: vehicle.id,
      plate: 'XYZ9A88',
      brandId: 'brand-ford',
      modelId: 'model-ranger',
    });
    expect(updated.plate).toBe('XYZ9A88');
    expect(updated.brandId).toBe('brand-ford');
    expect(updated.modelId).toBe('model-ranger');
    expect(updated.needsCatalogReview).toBe(false);
    expect(vehicles.vehicles).toHaveLength(1); // edita, não duplica
  });

  it('"Outro" grava texto livre e volta a marcar para catalogação (§3.3)', async () => {
    const { customers, vehicles, vehicle } = await seed();
    const updated = await updateVehicle({ customers, vehicles }, team, {
      vehicleId: vehicle.id,
      plate: 'ABC1D23',
      brandOther: 'Troller',
      modelOther: 'T4',
    });
    expect(updated.brandId).toBeNull();
    expect(updated.brandOther).toBe('Troller');
    expect(updated.modelOther).toBe('T4');
    expect(updated.needsCatalogReview).toBe(true);
  });

  it('recusa placa inválida, modelo de outra marca e veículo inexistente', async () => {
    const { customers, vehicles, vehicle } = await seed();

    await expect(
      updateVehicle({ customers, vehicles }, team, { vehicleId: vehicle.id, plate: 'XX' }),
    ).rejects.toThrow();

    await expect(
      updateVehicle({ customers, vehicles }, team, {
        vehicleId: vehicle.id,
        plate: 'ABC1D23',
        brandId: 'brand-jeep',
        modelId: 'model-ranger', // Ranger é Ford
      }),
    ).rejects.toThrow();

    await expect(
      updateVehicle({ customers, vehicles }, team, { vehicleId: 'nao-existe', plate: 'ABC1D23' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('o cliente não edita o veículo de outra família', async () => {
    const { customers, vehicles, vehicle } = await seed();
    const outsider = await customers.create({
      tenantId: 'tenant-a',
      responsibleId: null,
      fullName: 'De Fora',
      cpf: parseCpf('900.000.100-57'),
      birthDate: parseLocalDate('1990-01-01'),
      email: 'fora@example.com',
      phone: '5548999990001',
      address: EMPTY_ADDRESS,
    });
    const outsiderCtx: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', customerId: outsider.id, userId: 'cust-2' },
    };
    await expect(
      updateVehicle({ customers, vehicles }, outsiderCtx, {
        vehicleId: vehicle.id,
        plate: 'XYZ9A88',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

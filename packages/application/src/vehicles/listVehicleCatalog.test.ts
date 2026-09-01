import { describe, it, expect } from 'vitest';
import { listVehicleBrands, listVehicleModels } from './listVehicleCatalog.js';
import { fakeVehicleRepository } from './vehicleRepository.fake.js';
import type { RequestContext } from '../context.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const CATALOG = {
  brands: [
    { id: 'brand-ford', name: 'Ford' },
    { id: 'brand-fiat', name: 'Fiat' },
  ],
  models: [
    { id: 'model-ranger', brandId: 'brand-ford', name: 'Ranger' },
    { id: 'model-toro', brandId: 'brand-fiat', name: 'Toro' },
  ],
};

describe('CL-05: catálogo de veículos', () => {
  it('lista as marcas do tenant', async () => {
    const vehicles = fakeVehicleRepository(CATALOG);
    const brands = await listVehicleBrands({ vehicles }, ctx);
    expect(brands.map((b) => b.name)).toEqual(['Ford', 'Fiat']);
  });

  it('lista só os modelos da marca escolhida (cascata)', async () => {
    const vehicles = fakeVehicleRepository(CATALOG);
    const models = await listVehicleModels({ vehicles }, ctx, 'brand-ford');
    expect(models.map((m) => m.name)).toEqual(['Ranger']);
  });
});

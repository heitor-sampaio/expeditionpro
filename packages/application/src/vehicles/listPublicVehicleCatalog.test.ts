import { describe, expect, it } from 'vitest';
import { listPublicVehicleBrands, listPublicVehicleModels } from './listPublicVehicleCatalog.js';
import { fakeVehicleRepository } from './vehicleRepository.fake.js';
import { fakeTenantRepository } from '../tenants/tenantRepository.fake.js';

const BRANDS = [
  { id: 'b-ford', tenantId: 'tenant-a', name: 'Ford', isActive: true },
  { id: 'b-toyota', tenantId: 'tenant-a', name: 'Toyota', isActive: true },
];
const MODELS = [
  { id: 'm-ranger', tenantId: 'tenant-a', brandId: 'b-ford', name: 'Ranger', isActive: true },
  { id: 'm-hilux', tenantId: 'tenant-a', brandId: 'b-toyota', name: 'Hilux', isActive: true },
];

function deps() {
  return {
    tenants: fakeTenantRepository(),
    vehicles: fakeVehicleRepository({ brands: BRANDS, models: MODELS }),
  };
}

describe('CL-05 · IN-25: o catálogo de veículos para quem não tem sessão', () => {
  it('lista as marcas do tenant do link', async () => {
    const marcas = await listPublicVehicleBrands(deps(), { tenantSlug: 'drk' });

    expect(marcas.map((m) => m.name)).toEqual(['Ford', 'Toyota']);
  });

  it('lista os modelos da marca, em cascata', async () => {
    const modelos = await listPublicVehicleModels(deps(), {
      tenantSlug: 'drk',
      brandId: 'b-ford',
    });

    expect(modelos.map((m) => m.name)).toEqual(['Ranger']);
  });

  /**
   * **Tenant inexistente devolve lista vazia, não erro.** É a recusa mais silenciosa que
   * existe: não confirma nem nega que a empresa usa o sistema, e a tela já sabe atravessar
   * catálogo vazio — ela cai no "Outro", que é texto livre.
   */
  it('tenant que não existe devolve lista vazia, sem nem consultar o catálogo', async () => {
    const d = deps();

    expect(await listPublicVehicleBrands(d, { tenantSlug: 'nao-existe' })).toEqual([]);
    expect(
      await listPublicVehicleModels(d, { tenantSlug: 'nao-existe', brandId: 'b-ford' }),
    ).toEqual([]);
  });

  /** Só id e nome saem daqui: é o que o combobox mostra, e o resto não é da conta de ninguém. */
  it('devolve só id e nome', async () => {
    const marcas = await listPublicVehicleBrands(deps(), { tenantSlug: 'drk' });

    expect(marcas[0]).toEqual({ id: 'b-ford', name: 'Ford' });
  });
});

import type {
  NewVehicle,
  VehicleWithNames,
  VehicleBrandRecord,
  VehicleModelRecord,
  VehicleRecord,
  VehicleRepository,
} from './vehicleRepository.js';

/**
 * Fake in-memory do port de veículos para os testes de caso de uso. Excluído do
 * build (`*.fake.ts`). Constraints reais (UNIQUE placa) vão no teste de integração.
 */
export function fakeVehicleRepository(seed?: {
  brands?: VehicleBrandRecord[];
  models?: VehicleModelRecord[];
}): VehicleRepository & { vehicles: VehicleRecord[] } {
  const brands = seed?.brands ?? [];
  const models = seed?.models ?? [];
  const vehicles: VehicleRecord[] = [];
  let seq = 0;

  return {
    vehicles,
    listBrands(_tenantId: string) {
      return Promise.resolve(brands);
    },
    listModels(_tenantId: string, brandId: string) {
      return Promise.resolve(models.filter((m) => m.brandId === brandId));
    },
    findBrand(_tenantId: string, brandId: string) {
      return Promise.resolve(brands.find((b) => b.id === brandId) ?? null);
    },
    findModel(_tenantId: string, modelId: string) {
      return Promise.resolve(models.find((m) => m.id === modelId) ?? null);
    },
    createVehicle(data: NewVehicle) {
      seq += 1;
      const record: VehicleRecord = { ...data, id: `veh-${seq}` };
      vehicles.push(record);
      return Promise.resolve(record);
    },
    listByCustomers(tenantId: string, customerIds: readonly string[]) {
      const wanted = new Set(customerIds);
      const found: VehicleWithNames[] = [];
      for (const v of vehicles) {
        if (v.tenantId !== tenantId || !wanted.has(v.customerId)) continue;
        if (found.some((f) => f.customerId === v.customerId)) continue;
        found.push({
          customerId: v.customerId,
          brandName: brands.find((b) => b.id === v.brandId)?.name ?? null,
          modelName: models.find((m) => m.id === v.modelId)?.name ?? null,
          brandOther: v.brandOther,
          modelOther: v.modelOther,
          plate: v.plate,
        });
      }
      return Promise.resolve(found);
    },
    listVehiclesByCustomer(tenantId: string, customerId: string) {
      return Promise.resolve(
        vehicles.filter((v) => v.tenantId === tenantId && v.customerId === customerId),
      );
    },
    findVehicleById(tenantId: string, vehicleId: string) {
      return Promise.resolve(
        vehicles.find((v) => v.tenantId === tenantId && v.id === vehicleId) ?? null,
      );
    },
    updateVehicle(
      tenantId: string,
      vehicleId: string,
      data: Omit<NewVehicle, 'tenantId' | 'customerId'>,
    ) {
      const index = vehicles.findIndex((v) => v.tenantId === tenantId && v.id === vehicleId);
      if (index === -1) return Promise.reject(new Error('not found'));
      const updated: VehicleRecord = { ...vehicles[index]!, ...data };
      vehicles[index] = updated;
      return Promise.resolve(updated);
    },
    reassignVehicles(tenantId: string, fromCustomerId: string, toCustomerId: string) {
      vehicles.forEach((v, i) => {
        if (v.tenantId === tenantId && v.customerId === fromCustomerId) {
          vehicles[i] = { ...v, customerId: toCustomerId };
        }
      });
      return Promise.resolve();
    },
  };
}

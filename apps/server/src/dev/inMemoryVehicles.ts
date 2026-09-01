import type {
  NewVehicle,
  VehicleBrandRecord,
  VehicleModelRecord,
  VehicleRecord,
  VehicleRepository,
} from '@expedition/application';

/**
 * Repositório de veículos em memória — SÓ para dev sem banco e testes de rota.
 * Aceita um catálogo semeado para exercitar o combobox.
 */
export function inMemoryVehicles(seed?: {
  brands?: VehicleBrandRecord[];
  models?: VehicleModelRecord[];
}): VehicleRepository {
  const brands = seed?.brands ?? [];
  const models = seed?.models ?? [];
  const vehicles: VehicleRecord[] = [];
  let seq = 0;

  return {
    listBrands() {
      return Promise.resolve(brands);
    },
    listModels(_tenantId, brandId) {
      return Promise.resolve(models.filter((m) => m.brandId === brandId));
    },
    findBrand(_tenantId, brandId) {
      return Promise.resolve(brands.find((b) => b.id === brandId) ?? null);
    },
    findModel(_tenantId, modelId) {
      return Promise.resolve(models.find((m) => m.id === modelId) ?? null);
    },
    createVehicle(data: NewVehicle) {
      seq += 1;
      const record: VehicleRecord = { ...data, id: `dev-veh-${seq}` };
      vehicles.push(record);
      return Promise.resolve(record);
    },
    listByCustomers(tenantId, customerIds) {
      const wanted = new Set(customerIds);
      const first = new Map();
      for (const v of vehicles) {
        if (v.tenantId !== tenantId || !wanted.has(v.customerId)) continue;
        if (first.has(v.customerId)) continue;
        first.set(v.customerId, {
          customerId: v.customerId,
          brandName: brands.find((b) => b.id === v.brandId)?.name ?? null,
          modelName: models.find((m) => m.id === v.modelId)?.name ?? null,
          brandOther: v.brandOther,
          modelOther: v.modelOther,
          plate: v.plate,
        });
      }
      return Promise.resolve([...first.values()]);
    },
    listVehiclesByCustomer(tenantId, customerId) {
      return Promise.resolve(
        vehicles.filter((v) => v.tenantId === tenantId && v.customerId === customerId),
      );
    },
    findVehicleById(tenantId, vehicleId) {
      return Promise.resolve(
        vehicles.find((v) => v.tenantId === tenantId && v.id === vehicleId) ?? null,
      );
    },
    updateVehicle(tenantId, vehicleId, data) {
      const index = vehicles.findIndex((v) => v.tenantId === tenantId && v.id === vehicleId);
      if (index === -1) return Promise.reject(new Error('not found'));
      const updated: VehicleRecord = { ...vehicles[index]!, ...data };
      vehicles[index] = updated;
      return Promise.resolve(updated);
    },
    reassignVehicles(tenantId, fromCustomerId, toCustomerId) {
      vehicles.forEach((v, i) => {
        if (v.tenantId === tenantId && v.customerId === fromCustomerId) {
          vehicles[i] = { ...v, customerId: toCustomerId };
        }
      });
      return Promise.resolve();
    },
  };
}

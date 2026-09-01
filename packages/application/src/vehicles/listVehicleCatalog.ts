import type { RequestContext } from '../context.js';
import type {
  VehicleBrandRecord,
  VehicleModelRecord,
  VehicleRepository,
} from './vehicleRepository.js';

/**
 * CL-05 — leitura do catálogo de veículos para alimentar o combobox. Só listagem;
 * o escopo por tenant é garantido pelo repositório (tenantClient / RLS).
 */

export interface VehicleCatalogDeps {
  readonly vehicles: VehicleRepository;
}

export function listVehicleBrands(
  deps: VehicleCatalogDeps,
  ctx: RequestContext,
): Promise<VehicleBrandRecord[]> {
  return deps.vehicles.listBrands(ctx.tenantId);
}

export function listVehicleModels(
  deps: VehicleCatalogDeps,
  ctx: RequestContext,
  brandId: string,
): Promise<VehicleModelRecord[]> {
  return deps.vehicles.listModels(ctx.tenantId, brandId);
}

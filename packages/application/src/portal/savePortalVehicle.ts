import { saveVehicle } from '../vehicles/saveVehicle.js';
import { assertActorManagesCustomer } from './familyScope.js';
import type { RequestContext } from '../context.js';
import type { SaveVehicleCommand, SaveVehicleDeps } from '../vehicles/saveVehicle.js';
import type { VehicleRecord } from '../vehicles/vehicleRepository.js';

/**
 * PC-06 — o cliente anexa/edita um veículo de um membro da própria família. Reusa o
 * `saveVehicle` (catálogo, placa, fila de catalogação) atrás do guarda de família.
 */

export async function savePortalVehicle(
  deps: SaveVehicleDeps,
  ctx: RequestContext,
  command: SaveVehicleCommand,
): Promise<VehicleRecord> {
  await assertActorManagesCustomer(deps.customers, ctx, command.customerId);
  return saveVehicle(deps, ctx, command);
}

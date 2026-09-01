import { parsePlate } from '@expedition/domain';
import { NotFoundError } from '../errors.js';
import { assertActorManagesCustomer } from '../portal/familyScope.js';
import { resolveCatalogSelection, type CatalogSelectionInput } from './vehicleCatalogSelection.js';
import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { VehicleRecord, VehicleRepository } from './vehicleRepository.js';

/**
 * CL-05 — edita o veículo já anexado (trocou de carro, corrigiu a placa). Recebe a
 * escolha inteira, não um patch: o formulário mostra placa + marca + modelo juntos, e
 * meia edição de catálogo deixaria `*_other` órfão ao lado de um id.
 *
 * Escopo de família pelo **dono do veículo**: o cliente só mexe no da própria família.
 */

export interface UpdateVehicleCommand extends CatalogSelectionInput {
  readonly vehicleId: string;
  readonly plate: string;
}

export interface UpdateVehicleDeps {
  readonly customers: CustomerRepository;
  readonly vehicles: VehicleRepository;
}

export async function updateVehicle(
  deps: UpdateVehicleDeps,
  ctx: RequestContext,
  command: UpdateVehicleCommand,
): Promise<VehicleRecord> {
  const current = await deps.vehicles.findVehicleById(ctx.tenantId, command.vehicleId);
  if (!current) throw new NotFoundError('veículo');

  await assertActorManagesCustomer(deps.customers, ctx, current.customerId);

  const plate = parsePlate(command.plate);
  const selection = await resolveCatalogSelection(deps.vehicles, ctx, command);

  return deps.vehicles.updateVehicle(ctx.tenantId, current.id, { ...selection, plate });
}

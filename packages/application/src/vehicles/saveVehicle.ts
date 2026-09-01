import { parsePlate } from '@expedition/domain';
import { NotFoundError } from '../errors.js';
import { resolveCatalogSelection } from './vehicleCatalogSelection.js';
import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { VehicleRecord, VehicleRepository } from './vehicleRepository.js';

/**
 * CL-05 — anexa um veículo ao cliente. Marca e modelo vêm do catálogo (por id) OU
 * como texto livre "Outro", que grava `*_other` e entra na fila de catalogação
 * (§3.3). A placa é validada (antigo/Mercosul). Ids de catálogo são conferidos
 * contra o tenant para não referenciar marca/modelo de fora.
 */

export interface SaveVehicleCommand {
  readonly customerId: string;
  readonly brandId?: string | undefined;
  readonly brandOther?: string | undefined;
  readonly modelId?: string | undefined;
  readonly modelOther?: string | undefined;
  readonly plate: string;
}

export interface SaveVehicleDeps {
  readonly customers: CustomerRepository;
  readonly vehicles: VehicleRepository;
}

export async function saveVehicle(
  deps: SaveVehicleDeps,
  ctx: RequestContext,
  command: SaveVehicleCommand,
): Promise<VehicleRecord> {
  const customer = await deps.customers.findById(ctx.tenantId, command.customerId);
  if (!customer) throw new NotFoundError('cliente');

  const plate = parsePlate(command.plate);

  const selection = await resolveCatalogSelection(deps.vehicles, ctx, command);

  return deps.vehicles.createVehicle({
    tenantId: ctx.tenantId,
    customerId: customer.id,
    ...selection,
    plate,
  });
}

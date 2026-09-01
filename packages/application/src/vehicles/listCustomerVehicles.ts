import { assertActorManagesCustomer } from '../portal/familyScope.js';
import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { VehicleRecord, VehicleRepository } from './vehicleRepository.js';

/**
 * CL-05 — os veículos de um cliente. Escopo de família: a equipe lê qualquer um do
 * tenant; o cliente, só a própria família (mesmo guarda da escrita do portal, PC-06).
 */

export interface ListCustomerVehiclesDeps {
  readonly customers: CustomerRepository;
  readonly vehicles: VehicleRepository;
}

export interface ListCustomerVehiclesCommand {
  readonly customerId: string;
}

export async function listCustomerVehicles(
  deps: ListCustomerVehiclesDeps,
  ctx: RequestContext,
  command: ListCustomerVehiclesCommand,
): Promise<VehicleRecord[]> {
  await assertActorManagesCustomer(deps.customers, ctx, command.customerId);
  return deps.vehicles.listVehiclesByCustomer(ctx.tenantId, command.customerId);
}

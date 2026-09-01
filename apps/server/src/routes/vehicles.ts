import {
  listCustomerVehicles,
  listVehicleBrands,
  listVehicleModels,
  saveVehicle,
  updateVehicle,
} from '@expedition/application';
import { formatPlate } from '@expedition/domain';
import { z } from 'zod';
import type { VehicleRecord } from '@expedition/application';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * Rotas de veículo (CL-05): catálogo (marcas, modelos por marca) para o combobox,
 * e salvar o veículo do cliente. Regras (placa, "Outro", pertencimento) no caso de uso.
 */

const saveVehicleBody = z.object({
  brandId: z.string().optional(),
  brandOther: z.string().optional(),
  modelId: z.string().optional(),
  modelOther: z.string().optional(),
  plate: z.string().min(1),
});

export function registerVehicleRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get('/v1/vehicle-brands', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const brands = await listVehicleBrands({ vehicles: deps.vehicles }, ctx);
    return reply.send(brands.map((brand) => ({ id: brand.id, name: brand.name })));
  });

  typed.get(
    '/v1/vehicle-brands/:brandId/models',
    { schema: { params: z.object({ brandId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const models = await listVehicleModels(
        { vehicles: deps.vehicles },
        ctx,
        request.params.brandId,
      );
      return reply.send(models.map((model) => ({ id: model.id, name: model.name })));
    },
  );

  typed.get(
    '/v1/customers/:id/vehicles',
    { schema: { params: z.object({ id: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const vehicles = await listCustomerVehicles(
        { customers: deps.customers, vehicles: deps.vehicles },
        ctx,
        { customerId: request.params.id },
      );
      return reply.send(vehicles.map(toVehicleDto));
    },
  );

  // CL-05 — editar o veículo já anexado: o corpo traz a escolha inteira, não um patch
  typed.patch(
    '/v1/vehicles/:vehicleId',
    { schema: { params: z.object({ vehicleId: z.string().min(1) }), body: saveVehicleBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const vehicle = await updateVehicle(
        { customers: deps.customers, vehicles: deps.vehicles },
        ctx,
        { vehicleId: request.params.vehicleId, ...request.body },
      );
      return reply.send(toVehicleDto(vehicle));
    },
  );

  typed.post(
    '/v1/customers/:id/vehicles',
    { schema: { params: z.object({ id: z.string().min(1) }), body: saveVehicleBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const vehicle = await saveVehicle(
        { customers: deps.customers, vehicles: deps.vehicles },
        ctx,
        {
          customerId: request.params.id,
          ...request.body,
        },
      );
      return reply.status(201).send(toVehicleDto(vehicle));
    },
  );
}

function toVehicleDto(vehicle: VehicleRecord) {
  return {
    id: vehicle.id,
    brandId: vehicle.brandId,
    modelId: vehicle.modelId,
    brandOther: vehicle.brandOther,
    modelOther: vehicle.modelOther,
    needsCatalogReview: vehicle.needsCatalogReview,
    plate: formatPlate(vehicle.plate),
  };
}

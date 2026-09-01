import type {
  NewVehicle,
  VehicleBrandRecord,
  VehicleModelRecord,
  VehicleRecord,
  VehicleWithNames,
  VehicleRepository,
} from '@expedition/application';
import type { Plate } from '@expedition/domain';
import type { Vehicle as PrismaVehicle } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma do port de veículos. Catálogo e veículo do cliente, todos
 * pelo tenantClient (injeta o tenant, §2.2). DTO por camada; Prisma não vaza.
 */
export function prismaVehicleRepository(base: PrismaClient): VehicleRepository {
  return {
    listBrands(tenantId: string): Promise<VehicleBrandRecord[]> {
      return tenantClient(base, tenantId).vehicleBrand.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
    },

    listModels(tenantId: string, brandId: string): Promise<VehicleModelRecord[]> {
      return tenantClient(base, tenantId).vehicleModel.findMany({
        where: { brandId, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, brandId: true, name: true },
      });
    },

    findBrand(tenantId: string, brandId: string): Promise<VehicleBrandRecord | null> {
      return tenantClient(base, tenantId).vehicleBrand.findUnique({
        where: { id: brandId },
        select: { id: true, name: true },
      });
    },

    findModel(tenantId: string, modelId: string): Promise<VehicleModelRecord | null> {
      return tenantClient(base, tenantId).vehicleModel.findUnique({
        where: { id: modelId },
        select: { id: true, brandId: true, name: true },
      });
    },

    async createVehicle(data: NewVehicle): Promise<VehicleRecord> {
      const row = await tenantClient(base, data.tenantId).vehicle.create({
        data: {
          tenantId: data.tenantId,
          customerId: data.customerId,
          brandId: data.brandId,
          modelId: data.modelId,
          brandOther: data.brandOther,
          modelOther: data.modelOther,
          needsCatalogReview: data.needsCatalogReview,
          plate: data.plate,
        },
      });
      return toVehicleRecord(row);
    },

    async listByCustomers(
      tenantId: string,
      customerIds: readonly string[],
    ): Promise<VehicleWithNames[]> {
      if (customerIds.length === 0) return [];
      const rows = await tenantClient(base, tenantId).vehicle.findMany({
        where: { customerId: { in: [...customerIds] } },
        orderBy: { createdAt: 'asc' },
        include: { brand: true, model: true },
      });
      // Um por cliente: a mesa mostra o carro da família, não a garagem.
      const first = new Map<string, VehicleWithNames>();
      for (const row of rows) {
        if (first.has(row.customerId)) continue;
        first.set(row.customerId, {
          customerId: row.customerId,
          brandName: row.brand?.name ?? null,
          modelName: row.model?.name ?? null,
          brandOther: row.brandOther,
          modelOther: row.modelOther,
          plate: row.plate as Plate,
        });
      }
      return [...first.values()];
    },

    async listVehiclesByCustomer(tenantId: string, customerId: string): Promise<VehicleRecord[]> {
      const rows = await tenantClient(base, tenantId).vehicle.findMany({
        where: { customerId },
        orderBy: { plate: 'asc' },
      });
      return rows.map(toVehicleRecord);
    },

    async findVehicleById(tenantId: string, vehicleId: string): Promise<VehicleRecord | null> {
      const row = await tenantClient(base, tenantId).vehicle.findFirst({
        where: { id: vehicleId },
      });
      return row ? toVehicleRecord(row) : null;
    },

    async updateVehicle(
      tenantId: string,
      vehicleId: string,
      data: Omit<NewVehicle, 'tenantId' | 'customerId'>,
    ): Promise<VehicleRecord> {
      const row = await tenantClient(base, tenantId).vehicle.update({
        where: { id: vehicleId },
        data: {
          brandId: data.brandId,
          modelId: data.modelId,
          brandOther: data.brandOther,
          modelOther: data.modelOther,
          needsCatalogReview: data.needsCatalogReview,
          plate: data.plate,
        },
      });
      return toVehicleRecord(row);
    },

    async reassignVehicles(
      tenantId: string,
      fromCustomerId: string,
      toCustomerId: string,
    ): Promise<void> {
      await tenantClient(base, tenantId).vehicle.updateMany({
        where: { customerId: fromCustomerId },
        data: { customerId: toCustomerId },
      });
    },
  };
}

function toVehicleRecord(row: PrismaVehicle): VehicleRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    customerId: row.customerId,
    brandId: row.brandId,
    modelId: row.modelId,
    brandOther: row.brandOther,
    modelOther: row.modelOther,
    needsCatalogReview: row.needsCatalogReview,
    plate: row.plate as Plate,
  };
}

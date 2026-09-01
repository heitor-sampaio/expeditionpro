import type { Plate } from '@expedition/domain';

/**
 * Port de veículos e do catálogo (marcas/modelos). A aplicação define; a infra
 * (Prisma) implementa. Catálogo é leitura; veículo do cliente é escrita.
 */

export interface VehicleBrandRecord {
  readonly id: string;
  readonly name: string;
}

export interface VehicleModelRecord {
  readonly id: string;
  readonly brandId: string;
  readonly name: string;
}

export interface NewVehicle {
  readonly tenantId: string;
  readonly customerId: string;
  readonly brandId: string | null;
  readonly modelId: string | null;
  readonly brandOther: string | null;
  readonly modelOther: string | null;
  readonly needsCatalogReview: boolean;
  readonly plate: Plate;
}

export interface VehicleRecord extends NewVehicle {
  readonly id: string;
}

/**
 * GR-14 — o carro para a mesa do grupo: marca e modelo já **resolvidos do catálogo**,
 * porque a mesa não vai carregar o catálogo inteiro para traduzir dois ids por linha.
 */
export interface VehicleWithNames {
  readonly customerId: string;
  readonly brandName: string | null;
  readonly modelName: string | null;
  readonly brandOther: string | null;
  readonly modelOther: string | null;
  readonly plate: Plate;
}

export interface VehicleRepository {
  listBrands(tenantId: string): Promise<VehicleBrandRecord[]>;
  listModels(tenantId: string, brandId: string): Promise<VehicleModelRecord[]>;
  findBrand(tenantId: string, brandId: string): Promise<VehicleBrandRecord | null>;
  findModel(tenantId: string, modelId: string): Promise<VehicleModelRecord | null>;
  createVehicle(data: NewVehicle): Promise<VehicleRecord>;
  /** GR-14: um carro por cliente, com marca/modelo resolvidos — leitura em lote. */
  listByCustomers(tenantId: string, customerIds: readonly string[]): Promise<VehicleWithNames[]>;
  /** Veículos de um cliente (CL-05). */
  listVehiclesByCustomer(tenantId: string, customerId: string): Promise<VehicleRecord[]>;
  findVehicleById(tenantId: string, vehicleId: string): Promise<VehicleRecord | null>;
  /** CL-05: reescreve placa e escolha de catálogo do veículo (edição, não patch). */
  updateVehicle(
    tenantId: string,
    vehicleId: string,
    data: Omit<NewVehicle, 'tenantId' | 'customerId'>,
  ): Promise<VehicleRecord>;
  /** Move os veículos de um cliente para outro (CL-07 merge). */
  reassignVehicles(tenantId: string, fromCustomerId: string, toCustomerId: string): Promise<void>;
}

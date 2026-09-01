import { BusinessRuleError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { VehicleRepository } from './vehicleRepository.js';

/**
 * CL-05/§3.3 — a escolha de marca e modelo: do catálogo (por id, conferido contra o
 * tenant) ou "Outro" em texto livre, que grava `*_other` e marca o veículo para
 * catalogação. Mesma regra ao anexar e ao editar — por isso mora aqui, não em cada um.
 */

export interface CatalogSelectionInput {
  readonly brandId?: string | undefined;
  readonly brandOther?: string | undefined;
  readonly modelId?: string | undefined;
  readonly modelOther?: string | undefined;
}

export interface CatalogSelection {
  readonly brandId: string | null;
  readonly brandOther: string | null;
  readonly modelId: string | null;
  readonly modelOther: string | null;
  readonly needsCatalogReview: boolean;
}

export async function resolveCatalogSelection(
  vehicles: VehicleRepository,
  ctx: RequestContext,
  input: CatalogSelectionInput,
): Promise<CatalogSelection> {
  let brandId: string | null = null;
  let brandOther: string | null = null;
  if (input.brandId) {
    const brand = await vehicles.findBrand(ctx.tenantId, input.brandId);
    if (!brand) throw new NotFoundError('marca');
    brandId = brand.id;
  } else if (input.brandOther?.trim()) {
    brandOther = input.brandOther.trim();
  }

  let modelId: string | null = null;
  let modelOther: string | null = null;
  if (input.modelId) {
    const model = await vehicles.findModel(ctx.tenantId, input.modelId);
    if (!model) throw new NotFoundError('modelo');
    if (brandId && model.brandId !== brandId) {
      throw new BusinessRuleError(
        'model_brand_mismatch',
        'O modelo não pertence à marca selecionada',
      );
    }
    modelId = model.id;
  } else if (input.modelOther?.trim()) {
    modelOther = input.modelOther.trim();
  }

  return {
    brandId,
    brandOther,
    modelId,
    modelOther,
    needsCatalogReview: brandOther !== null || modelOther !== null,
  };
}

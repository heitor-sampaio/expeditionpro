import type { TenantRepository } from '../tenants/tenantRepository.js';
import type { VehicleRepository } from './vehicleRepository.js';

/**
 * CL-05 · IN-25 — o catálogo de veículos para a página pública de inscrição.
 *
 * Vive ao lado de `listVehicleCatalog`, e não dentro: aquele recebe um `RequestContext` e lê
 * `ctx.tenantId` de uma sessão que já existe. Aqui não há sessão nenhuma, e o tenant vem do
 * slug do link — montar um contexto de mentira na rota para reaproveitar o outro seria
 * fabricar um ator que ninguém autenticou, dentro do caminho de produção.
 *
 * **Tenant inexistente devolve lista vazia, não erro.** É a recusa mais silenciosa que existe:
 * não confirma nem nega que a empresa usa o sistema (regra 2 do `public.ts`), e a tela já sabe
 * atravessar catálogo vazio — ela cai no "Outro", que é texto livre.
 *
 * O `brandId` vem do navegador e **não é conferido à parte**: `listModels` filtra por tenant,
 * então uma marca de outra empresa simplesmente não tem modelo nenhum aqui. A conferência é o
 * filtro, não uma checagem que se possa esquecer de escrever.
 */

export interface PublicVehicleCatalogDeps {
  readonly tenants: TenantRepository;
  readonly vehicles: VehicleRepository;
}

export interface PublicCatalogItem {
  readonly id: string;
  readonly name: string;
}

export async function listPublicVehicleBrands(
  deps: PublicVehicleCatalogDeps,
  command: { readonly tenantSlug: string },
): Promise<PublicCatalogItem[]> {
  const tenantId = await deps.tenants.findIdBySlug(command.tenantSlug);
  if (tenantId === null) return [];
  const brands = await deps.vehicles.listBrands(tenantId);
  return brands.map(soNome);
}

export async function listPublicVehicleModels(
  deps: PublicVehicleCatalogDeps,
  command: { readonly tenantSlug: string; readonly brandId: string },
): Promise<PublicCatalogItem[]> {
  const tenantId = await deps.tenants.findIdBySlug(command.tenantSlug);
  if (tenantId === null) return [];
  const models = await deps.vehicles.listModels(tenantId, command.brandId);
  return models.map(soNome);
}

/** Só id e nome: é o que o combobox mostra, e o resto não é da conta de quem não tem sessão. */
function soNome(registro: { id: string; name: string }): PublicCatalogItem {
  return { id: registro.id, name: registro.name };
}

/**
 * CL-05 — o carro numa linha só: "Jeep Renegade". Marca e modelo vêm do catálogo ou do
 * texto livre "Outro" (§3.3), e quem lê a lista de embarque não precisa saber de qual
 * dos dois. Sem nada preenchido é `null` — string vazia viraria um espaço em branco na
 * célula, que parece dado faltando por bug.
 */

export interface VehicleNames {
  readonly brandName: string | null;
  readonly modelName: string | null;
  readonly brandOther: string | null;
  readonly modelOther: string | null;
}

export function describeVehicle(vehicle: VehicleNames): string | null {
  const parts = [
    firstFilled(vehicle.brandName, vehicle.brandOther),
    firstFilled(vehicle.modelName, vehicle.modelOther),
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' ') : null;
}

function firstFilled(a: string | null, b: string | null): string | null {
  const fromCatalog = a?.trim();
  if (fromCatalog) return fromCatalog;
  const freeText = b?.trim();
  return freeText ? freeText : null;
}

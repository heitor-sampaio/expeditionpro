/**
 * Placa de veículo (§3.3 / CL-05). Dois formatos válidos no Brasil:
 *   · antigo   ABC1234   (3 letras + 4 dígitos)
 *   · Mercosul ABC1D23   (3 letras + dígito + letra + 2 dígitos)
 *
 * Armazenada normalizada: caixa alta, sem separador. Assim o matching é estável.
 */

declare const plateBrand: unique symbol;
export type Plate = string & { readonly [plateBrand]: 'Plate' };

export class InvalidPlateError extends Error {
  constructor(raw: string) {
    super(`Placa inválida: "${raw}"`);
    this.name = 'InvalidPlateError';
  }
}

const OLD_FORMAT = /^[A-Z]{3}[0-9]{4}$/;
const MERCOSUL_FORMAT = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

function normalize(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

function isWellFormed(normalized: string): boolean {
  return OLD_FORMAT.test(normalized) || MERCOSUL_FORMAT.test(normalized);
}

export function isValidPlate(raw: string): boolean {
  return isWellFormed(normalize(raw));
}

export function parsePlate(raw: string): Plate {
  const normalized = normalize(raw);
  if (!isWellFormed(normalized)) {
    throw new InvalidPlateError(raw);
  }
  return normalized as Plate;
}

/** Formato antigo ganha hífen na exibição (ABC-1234); Mercosul fica como está. */
export function formatPlate(plate: Plate): string {
  return OLD_FORMAT.test(plate) ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate;
}

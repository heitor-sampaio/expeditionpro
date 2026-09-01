/**
 * CNPJ — documento do fornecedor pessoa jurídica (FO-01/FO-03).
 *
 * Value object branded, como o CPF: depois de `parseCnpj`, o tipo `Cnpj` garante que os
 * 14 dígitos passaram pelo dígito verificador. "Parse, don't validate".
 */

declare const cnpjBrand: unique symbol;
export type Cnpj = string & { readonly [cnpjBrand]: 'Cnpj' };

export class InvalidCnpjError extends Error {
  constructor(raw: string) {
    super(`CNPJ inválido: "${raw}"`);
    this.name = 'InvalidCnpjError';
  }
}

function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

// Pesos do dígito verificador do CNPJ (§ Receita Federal): 5..2 depois 9..2.
const WEIGHTS_FIRST = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const WEIGHTS_SECOND = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function checkDigit(digits: string, weights: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    sum += Number(digits[i]) * weights[i]!;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function hasValidCheckDigits(digits: string): boolean {
  if (digits.length !== 14) return false;
  // Sequência repetida (0000…, 1111…) passa na conta mas não é CNPJ.
  if (/^(\d)\1{13}$/.test(digits)) return false;
  return (
    checkDigit(digits, WEIGHTS_FIRST) === Number(digits[12]) &&
    checkDigit(digits, WEIGHTS_SECOND) === Number(digits[13])
  );
}

export function isValidCnpj(raw: string): boolean {
  return hasValidCheckDigits(onlyDigits(raw));
}

export function parseCnpj(raw: string): Cnpj {
  const digits = onlyDigits(raw);
  if (!hasValidCheckDigits(digits)) {
    throw new InvalidCnpjError(raw);
  }
  return digits as Cnpj;
}

/** Completo e pontuado, para a ficha: 11.222.333/0001-81 */
export function formatCnpj(cnpj: Cnpj): string {
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12, 14)}`;
}

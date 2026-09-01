/**
 * CPF — chave de identidade e de deduplicação (§3.8).
 *
 * Value object branded: depois de `parseCpf`, o tipo `Cpf` é a garantia de que
 * aqueles 11 dígitos já passaram pelo dígito verificador. "Parse, don't validate":
 * ninguém revalida depois da borda.
 */

declare const cpfBrand: unique symbol;
export type Cpf = string & { readonly [cpfBrand]: 'Cpf' };

export class InvalidCpfError extends Error {
  constructor(raw: string) {
    super(`CPF inválido: "${raw}"`);
    this.name = 'InvalidCpfError';
  }
}

function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

function checkDigit(digits: string, length: number): number {
  let sum = 0;
  let weight = length + 1;
  for (let i = 0; i < length; i += 1) {
    sum += Number(digits[i]) * weight;
    weight -= 1;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function hasValidCheckDigits(digits: string): boolean {
  if (digits.length !== 11) return false;
  // Sequência repetida (00000000000, 11111111111, …) passa na conta mas não é CPF.
  if (/^(\d)\1{10}$/.test(digits)) return false;
  return (
    checkDigit(digits, 9) === Number(digits[9]) && checkDigit(digits, 10) === Number(digits[10])
  );
}

export function isValidCpf(raw: string): boolean {
  return hasValidCheckDigits(onlyDigits(raw));
}

export function parseCpf(raw: string): Cpf {
  const digits = onlyDigits(raw);
  if (!hasValidCheckDigits(digits)) {
    throw new InvalidCpfError(raw);
  }
  return digits as Cpf;
}

/** Completo e pontuado, para a ficha (CL-08): 900.000.100-57 */
export function formatCpf(cpf: Cpf): string {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9, 11)}`;
}

/** Mascarado para listagens (CL-08): revela só início e dígitos verificadores. */
export function maskCpf(cpf: Cpf): string {
  return `${cpf.slice(0, 3)}.***.***-${cpf.slice(9, 11)}`;
}

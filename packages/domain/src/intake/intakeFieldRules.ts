import { parseCpf, isValidCpf, type Cpf } from '../identity/cpf.js';
import { isValidPlate, parsePlate, formatPlate } from '../vehicle/plate.js';
import { parseLocalDate, type LocalDate } from '../date/localDate.js';

/**
 * Regras de campo do webhook (§5.7.1), compartilhadas por cada perfil de mapeamento
 * (`wp_flat_v1`, `canonical_v1`, …). Cada perfil só sabe extrair o valor cru do seu
 * formato; a validação e a normalização — e portanto os **códigos de erro** — são as
 * mesmas aqui, para que dois perfis nunca divirjam no que aceitam. Funções puras.
 *
 * Obrigatório bloqueia (lança `IntakeValidationError` com o campo culpado → 422).
 * Malformado em campo opcional não bloqueia — grava como veio e registra aviso.
 */

export class IntakeValidationError extends Error {
  readonly field: string;
  readonly code: string;
  constructor(field: string, code: string) {
    super(`Campo "${field}" inválido: ${code}`);
    this.name = 'IntakeValidationError';
    this.field = field;
    this.code = code;
  }
}

/** Normaliza um valor cru para string aparada, ou null se ausente/vazio. */
export function cleanValue(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  return text.length > 0 ? text : null;
}

export function requireString(raw: unknown, key: string): string {
  const value = cleanValue(raw);
  if (value === null) throw new IntakeValidationError(key, 'required');
  return value;
}

export function requireCpf(raw: unknown, key: string): Cpf {
  const digits = requireString(raw, key).replace(/\D/g, '');
  if (!isValidCpf(digits)) throw new IntakeValidationError(key, 'invalid_check_digit');
  return parseCpf(digits);
}

export function requireDate(raw: unknown, key: string): LocalDate {
  const value = requireString(raw, key);
  try {
    return parseLocalDate(value);
  } catch {
    throw new IntakeValidationError(key, 'invalid_date');
  }
}

export function requireEmail(raw: unknown, key: string): string {
  const email = requireString(raw, key);
  // Checagem frouxa deliberada (§5.7.1): tem @ e um domínio plausível.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new IntakeValidationError(key, 'invalid_email');
  }
  return email;
}

export function requirePhone(raw: unknown, key: string): string {
  const digits = requireString(raw, key).replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) {
    throw new IntakeValidationError(key, 'invalid_phone');
  }
  return digits;
}

export function normalizeState(raw: unknown): string | null {
  const value = cleanValue(raw);
  return value ? value.toUpperCase().slice(0, 2) : null;
}

export function normalizeZip(raw: unknown): string | null {
  const value = cleanValue(raw);
  return value ? value.replace(/\D/g, '') : null;
}

export function optionalDate(raw: unknown): LocalDate | null {
  const value = cleanValue(raw);
  if (value === null) return null;
  try {
    return parseLocalDate(value);
  } catch {
    return null;
  }
}

/**
 * Placa: uppercase + formata quando válida (formato antigo ou Mercosul); inválida não
 * bloqueia — grava como veio e devolve um aviso para a fila (`plateValid: false`).
 */
export function resolvePlate(
  raw: unknown,
  warnings: string[],
): { plate: string | null; plateValid: boolean } {
  const plateRaw = cleanValue(raw);
  if (plateRaw === null) return { plate: null, plateValid: false };
  if (isValidPlate(plateRaw)) {
    return { plate: formatPlate(parsePlate(plateRaw)), plateValid: true };
  }
  warnings.push(`placa "${plateRaw}" com formato inválido — gravada como veio`);
  return { plate: plateRaw, plateValid: false };
}

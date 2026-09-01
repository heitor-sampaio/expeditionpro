import type { Cpf } from '../identity/cpf.js';
import type { LocalDate } from '../date/localDate.js';
import {
  IntakeValidationError,
  cleanValue,
  normalizeState,
  normalizeZip,
  optionalDate,
  requireCpf,
  requireDate,
  requireEmail,
  requirePhone,
  requireString,
  resolvePlate,
} from './intakeFieldRules.js';

/**
 * Perfil de mapeamento `wp_flat_v1` (§5.7.1) — coração do webhook. Função pura:
 * traduz o corpo cru do formulário para a forma interna, sem I/O. Obrigatório bloqueia
 * (lança `IntakeValidationError` com o campo culpado → 422); malformado em opcional não
 * bloqueia, grava como veio e registra aviso. Lê sempre `value`, nunca `formatted`.
 * As regras de campo vêm de `intakeFieldRules` — as mesmas de todo perfil.
 */

export { IntakeValidationError };

export interface MappedResponsible {
  readonly fullName: string;
  readonly cpf: Cpf;
  readonly birthDate: LocalDate;
  readonly email: string;
  readonly phone: string;
}

export interface MappedAddress {
  readonly street: string | null;
  readonly number: string | null;
  readonly district: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly zip: string | null;
}

export interface MappedVehicle {
  readonly brand: string | null;
  readonly model: string | null;
  readonly plate: string | null;
  readonly plateValid: boolean;
}

export interface MappedCompanion {
  readonly fullName: string;
  readonly cpf: Cpf;
  readonly birthDate: LocalDate;
}

export interface MappedIntake {
  readonly formId: string;
  readonly entryId: string;
  readonly submitted: string | null;
  readonly desiredDate: LocalDate | null;
  readonly responsible: MappedResponsible;
  readonly address: MappedAddress;
  readonly vehicle: MappedVehicle | null;
  readonly companions: readonly MappedCompanion[];
  readonly consent: boolean;
  readonly warnings: readonly string[];
  readonly customFields: Readonly<Record<string, string>>;
}

const CORE_KEYS = new Set([
  'resp_nome',
  'resp_cpf',
  'resp_email',
  'resp_telefone',
  'resp_nascimento',
  'cep',
  'endereco',
  'numero',
  'bairro',
  'cidade',
  'estado',
  'marca',
  'modelo',
  'placa',
  'qtd_acompanhantes',
  'aceite',
  'data_desejada',
]);

const COMPANION_KEY = /^acomp_\d+_(nome|cpf|nascimento)$/;

type FieldMap = Record<string, { value?: unknown } | undefined>;

export function mapWpFlatPayload(raw: unknown): MappedIntake {
  const src = unwrap(raw);
  const fields = (src.fields ?? {}) as FieldMap;
  const warnings: string[] = [];

  const responsible = mapResponsible(fields);
  const address = mapAddress(fields);
  const vehicle = mapVehicle(fields, warnings);
  const companions = mapCompanions(fields);
  const customFields = collectCustomFields(fields, warnings);

  return {
    formId: String(src.form_id ?? ''),
    entryId: String(src.entry_id ?? ''),
    submitted: typeof src.submitted === 'string' ? src.submitted : null,
    desiredDate: optionalDate(value(fields, 'data_desejada')),
    responsible,
    address,
    vehicle,
    companions,
    consent: value(fields, 'aceite') === '1',
    warnings,
    customFields,
  };
}

/**
 * IN-05 — lê só o identificador estrutural (`form_id`/`entry_id`) do corpo cru, sem
 * validar o resto. Serve para deduplicar e enfileirar mesmo quando o mapeamento completo
 * falha (a validação estoura nos campos `resp_*`, depois destes). Nunca lança.
 */
export function readWpFlatIdentity(raw: unknown): { formId: string; entryId: string } {
  const src = unwrap(raw);
  return { formId: String(src.form_id ?? ''), entryId: String(src.entry_id ?? '') };
}

function unwrap(raw: unknown): {
  fields?: unknown;
  form_id?: unknown;
  entry_id?: unknown;
  submitted?: unknown;
} {
  const element = Array.isArray(raw) ? raw[0] : raw;
  if (element && typeof element === 'object') {
    const withBody = element as { body?: unknown };
    const body = withBody.body ?? element;
    if (body && typeof body === 'object') {
      return body as Record<string, unknown>;
    }
  }
  return {};
}

function value(fields: FieldMap, key: string): string | null {
  return cleanValue(fields[key]?.value);
}

function mapResponsible(fields: FieldMap): MappedResponsible {
  return {
    fullName: requireString(value(fields, 'resp_nome'), 'resp_nome'),
    cpf: requireCpf(value(fields, 'resp_cpf'), 'resp_cpf'),
    birthDate: requireDate(value(fields, 'resp_nascimento'), 'resp_nascimento'),
    email: requireEmail(value(fields, 'resp_email'), 'resp_email'),
    phone: requirePhone(value(fields, 'resp_telefone'), 'resp_telefone'),
  };
}

function mapAddress(fields: FieldMap): MappedAddress {
  return {
    street: value(fields, 'endereco'),
    number: value(fields, 'numero'),
    district: value(fields, 'bairro'),
    city: value(fields, 'cidade'),
    state: normalizeState(value(fields, 'estado')),
    zip: normalizeZip(value(fields, 'cep')),
  };
}

function mapVehicle(fields: FieldMap, warnings: string[]): MappedVehicle | null {
  const brand = value(fields, 'marca');
  const model = value(fields, 'modelo');
  const plateRaw = value(fields, 'placa');
  if (brand === null && model === null && plateRaw === null) return null;
  const { plate, plateValid } = resolvePlate(plateRaw, warnings);
  return { brand, model, plate, plateValid };
}

function mapCompanions(fields: FieldMap): MappedCompanion[] {
  const indexes = new Set<number>();
  for (const key of Object.keys(fields)) {
    const match = /^acomp_(\d+)_/.exec(key);
    if (match) indexes.add(Number(match[1]));
  }

  return [...indexes]
    .sort((a, b) => a - b)
    .map((n) => ({
      fullName: requireString(value(fields, `acomp_${n}_nome`), `acomp_${n}_nome`),
      cpf: requireCpf(value(fields, `acomp_${n}_cpf`), `acomp_${n}_cpf`),
      birthDate: requireDate(value(fields, `acomp_${n}_nascimento`), `acomp_${n}_nascimento`),
    }));
}

function collectCustomFields(fields: FieldMap, warnings: string[]): Record<string, string> {
  const custom: Record<string, string> = {};
  for (const key of Object.keys(fields)) {
    if (CORE_KEYS.has(key) || COMPANION_KEY.test(key)) continue;
    const v = value(fields, key);
    if (v !== null) {
      custom[key] = v;
      warnings.push(`campo desconhecido "${key}" gravado em custom_fields`);
    }
  }
  return custom;
}

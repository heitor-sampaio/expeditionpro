import type {
  MappedAddress,
  MappedCompanion,
  MappedIntake,
  MappedResponsible,
  MappedVehicle,
} from './mapWpFlatPayload.js';
import {
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
 * Perfil de mapeamento `canonical_v1` (§5.7.1 · IN-01b) — para integrações que controlam
 * o próprio payload e enviam objetos aninhados (`responsible`, `vehicle`, `companions[]`)
 * em vez de campos planos. Traduz para a MESMA forma interna do `wp_flat_v1`, com as
 * MESMAS regras de campo (`intakeFieldRules`) — logo os mesmos códigos de erro. Função
 * pura, sem I/O. O domínio não muda: só existe outro tradutor na borda.
 */

type Obj = Record<string, unknown>;

export function mapCanonicalV1Payload(raw: unknown): MappedIntake {
  const src = unwrap(raw);
  const warnings: string[] = [];
  const { formId, entryId } = readCanonicalV1Identity(src);

  return {
    formId,
    entryId,
    submitted: typeof src['submitted'] === 'string' ? src['submitted'] : null,
    desiredDate: optionalDate(src['desired_date']),
    responsible: mapResponsible(obj(src['responsible'])),
    address: mapAddress(obj(src['address'])),
    vehicle: mapVehicle(src['vehicle'], warnings),
    companions: mapCompanions(src['companions']),
    consent: src['consent'] === true || src['consent'] === '1',
    warnings,
    customFields: mapCustomFields(src['custom_fields']),
  };
}

/**
 * IN-05 — lê só o identificador estrutural do corpo cru, sem validar o resto. Serve para
 * deduplicar e enfileirar mesmo quando o mapeamento completo falha. Nunca lança.
 */
export function readCanonicalV1Identity(raw: unknown): { formId: string; entryId: string } {
  const src = unwrap(raw);
  return { formId: String(src['form_id'] ?? ''), entryId: String(src['entry_id'] ?? '') };
}

function unwrap(raw: unknown): Obj {
  const element = Array.isArray(raw) ? raw[0] : raw;
  if (element && typeof element === 'object') {
    const body = (element as { body?: unknown }).body ?? element;
    if (body && typeof body === 'object') return body as Obj;
  }
  return {};
}

function obj(value: unknown): Obj {
  return value && typeof value === 'object' ? (value as Obj) : {};
}

function mapResponsible(r: Obj): MappedResponsible {
  return {
    fullName: requireString(r['full_name'], 'responsible.full_name'),
    cpf: requireCpf(r['cpf'], 'responsible.cpf'),
    birthDate: requireDate(r['birth_date'], 'responsible.birth_date'),
    email: requireEmail(r['email'], 'responsible.email'),
    phone: requirePhone(r['phone'], 'responsible.phone'),
  };
}

function mapAddress(a: Obj): MappedAddress {
  return {
    street: cleanValue(a['street']),
    number: cleanValue(a['number']),
    district: cleanValue(a['district']),
    city: cleanValue(a['city']),
    state: normalizeState(a['state']),
    zip: normalizeZip(a['zip']),
  };
}

function mapVehicle(value: unknown, warnings: string[]): MappedVehicle | null {
  const v = obj(value);
  const brand = cleanValue(v['brand']);
  const model = cleanValue(v['model']);
  const plateRaw = cleanValue(v['plate']);
  if (brand === null && model === null && plateRaw === null) return null;
  const { plate, plateValid } = resolvePlate(plateRaw, warnings);
  return { brand, model, plate, plateValid };
}

function mapCompanions(value: unknown): MappedCompanion[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, i) => {
    const c = obj(entry);
    return {
      fullName: requireString(c['full_name'], `companions[${i}].full_name`),
      cpf: requireCpf(c['cpf'], `companions[${i}].cpf`),
      birthDate: requireDate(c['birth_date'], `companions[${i}].birth_date`),
    };
  });
}

function mapCustomFields(value: unknown): Record<string, string> {
  const custom: Record<string, string> = {};
  const source = obj(value);
  for (const key of Object.keys(source)) {
    const clean = cleanValue(source[key]);
    if (clean !== null) custom[key] = clean;
  }
  return custom;
}

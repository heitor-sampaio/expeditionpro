/**
 * Telefone brasileiro em E.164 (§3.2). Guardado só com dígitos, sempre com o código do
 * país (55): fixo `55` + DDD(2) + 8, celular `55` + DDD(2) + 9. Entrada sem DDI ganha o 55.
 * Exibição: `+55 (48)99999-8877`.
 *
 * Puro: entrada e saída, sem I/O. "Parse, don't validate" — depois de `parsePhone`, os
 * dígitos são a garantia de um telefone bem-formado.
 */

export class InvalidPhoneError extends Error {
  constructor(raw: string) {
    super(`Telefone inválido: "${raw}"`);
    this.name = 'InvalidPhoneError';
  }
}

/** Normaliza para E.164 (só dígitos, com DDI 55). Lança se não parece um telefone BR. */
export function parsePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  throw new InvalidPhoneError(raw);
}

export function isValidPhone(raw: string): boolean {
  try {
    parsePhone(raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * E.164 (dígitos) → `+55 (48)99999-8877`. Entrada fora do padrão volta como veio.
 *
 * Aceita também **DDD + número sem o DDI**: é o formato que o cadastro guardava antes
 * da normalização (§3.2), e esses registros continuam no banco. Sem isso, um telefone
 * antigo sairia cru num documento que vai para fora da empresa.
 */
export function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  const national = digits.length === 10 || digits.length === 11;
  const international = digits.startsWith('55') && (digits.length === 12 || digits.length === 13);
  if (!national && !international) {
    return e164;
  }
  const withDdi = national ? `55${digits}` : digits;
  const cc = withDdi.slice(0, 2);
  const ddd = withDdi.slice(2, 4);
  const rest = withDdi.slice(4);
  const mobile = rest.length === 9;
  const first = mobile ? rest.slice(0, 5) : rest.slice(0, 4);
  const last = mobile ? rest.slice(5) : rest.slice(4);
  return `+${cc} (${ddd})${first}-${last}`;
}

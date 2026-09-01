/**
 * CEP — validação "só formato" (§5.7.1). Guardado como 8 dígitos, exibido pontuado.
 * Malformado em campo opcional não bloqueia; só sinaliza. Não é branded: diferente
 * de CPF/placa, não há garantia forte a carregar pelo tipo.
 */

export function normalizeCep(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function isValidCep(raw: string): boolean {
  return /^\d{8}$/.test(normalizeCep(raw));
}

export function formatCep(raw: string): string {
  const digits = normalizeCep(raw);
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

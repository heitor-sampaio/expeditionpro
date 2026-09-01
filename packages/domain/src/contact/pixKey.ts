import { formatCnpj, isValidCnpj, parseCnpj } from '../identity/cnpj.js';
import { formatCpf, isValidCpf, parseCpf } from '../identity/cpf.js';
import { formatPhone, isValidPhone, parsePhone } from '../contact/phone.js';

/**
 * FO-07 — a chave PIX do fornecedor.
 *
 * O tipo é **descoberto a partir da chave**, não escolhido num seletor: o fornecedor manda
 * a chave por mensagem e a equipe cola. Pedir para classificar antes é trabalho que o
 * computador faz melhor, e um seletor errado ao lado de uma chave certa seria só um jeito
 * novo de errar num campo onde errar custa dinheiro no bolso de outra pessoa.
 *
 * Guardamos normalizado (dígitos no documento, E.164 no telefone, caixa baixa no resto) e
 * formatamos na leitura — mesma divisão do CPF e do telefone no resto do sistema.
 */

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

export interface PixKey {
  readonly type: PixKeyType;
  readonly value: string;
}

export class InvalidPixKeyError extends Error {
  constructor(raw: string) {
    super(`Chave PIX inválida: ${raw}`);
    this.name = 'InvalidPixKeyError';
  }
}

/** Chave aleatória do Banco Central: UUID em 8-4-4-4-12. */
const EVP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** E-mail: exigimos algo antes da arroba, um domínio e um TLD — o resto o PIX recusa lá. */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function parsePixKey(raw: string): PixKey {
  const trimmed = raw.trim();
  if (trimmed === '') throw new InvalidPixKeyError(raw);

  const lower = trimmed.toLowerCase();
  if (EVP.test(lower)) return { type: 'random', value: lower };
  if (trimmed.includes('@')) {
    if (!EMAIL.test(lower)) throw new InvalidPixKeyError(raw);
    return { type: 'email', value: lower };
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits === '') throw new InvalidPixKeyError(raw);

  if (digits.length === 14 && isValidCnpj(digits)) {
    return { type: 'cnpj', value: parseCnpj(digits) };
  }

  /*
   * Onze dígitos são ambíguos: CPF e celular com DDD têm o mesmo tamanho. O dígito
   * verificador desempata — o que passa é CPF, o que não passa tenta telefone. Sem isso, a
   * equipe colaria o celular do fornecedor e ouviria "CPF inválido" para um número certo.
   */
  if (digits.length === 11 && isValidCpf(digits)) {
    return { type: 'cpf', value: parseCpf(digits) };
  }

  if (isValidPhone(digits) && temCaraDeTelefone(digits)) {
    return { type: 'phone', value: parsePhone(digits) };
  }

  throw new InvalidPixKeyError(raw);
}

export function isValidPixKey(raw: string): boolean {
  try {
    parsePixKey(raw);
    return true;
  } catch {
    return false;
  }
}

/** Como a chave aparece para quem vai pagar. E-mail e chave aleatória saem como estão. */
export function formatPixKey(key: PixKey): string {
  if (key.type === 'cpf') return formatCpf(parseCpf(key.value));
  if (key.type === 'cnpj') return formatCnpj(parseCnpj(key.value));
  if (key.type === 'phone') return formatPhone(key.value);
  return key.value;
}

/**
 * O `parsePhone` do sistema só olha o tamanho, e para cadastro de contato isso basta —
 * telefone errado dá ligação que não completa. Chave PIX é outra coisa: `00000000000` tem
 * onze dígitos e viraria "telefone" sem esta checagem, guardando lixo num campo por onde
 * sai dinheiro. Aqui exigimos DDD plausível e, no celular, o 9 na frente.
 */
function temCaraDeTelefone(digits: string): boolean {
  const nacional = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (nacional.length !== 10 && nacional.length !== 11) return false;

  const ddd = Number(nacional.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;

  // Celular no Brasil tem 9 dígitos começando em 9; fixo tem 8 começando em 2..5.
  const numero = nacional.slice(2);
  return numero.length === 9 ? numero.startsWith('9') : /^[2-5]/.test(numero);
}

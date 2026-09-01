import type { LocalDate } from '../date/localDate.js';

/**
 * IN-04 — compara os dados de um cliente já cadastrado com os que chegaram na inscrição
 * e diz **o que divergiu**, campo a campo, com o valor proposto (a grafia recebida, só
 * aparada). Função pura: não sobrescreve, não decide, não toca em I/O. Quem transforma a
 * divergência em pedido na fila de revisão é a aplicação (§5.7.2), sem nunca sobrescrever
 * o cadastro — a equipe aprova ou descarta.
 *
 * Regras de comparação (para não gerar ruído):
 *   · nome — ignora caixa, acento e espaço repetido; muda de verdade → propõe o recebido
 *   · nascimento — igualdade de ano/mês/dia
 *   · telefone — compara só os dígitos; formatação diferente não é divergência
 *   · e-mail — ignora caixa
 *   · contato vazio nunca propõe apagar o que já existe; contato que passa a existir, sim
 */

export interface CustomerFacts {
  readonly fullName: string;
  readonly birthDate: LocalDate;
  readonly email: string | null;
  readonly phone: string | null;
}

export interface CustomerDivergence {
  readonly fullName: string | null;
  readonly birthDate: LocalDate | null;
  readonly email: string | null;
  readonly phone: string | null;
}

export function detectCustomerDivergence(
  current: CustomerFacts,
  incoming: CustomerFacts,
): CustomerDivergence {
  return {
    fullName: nameDiff(current.fullName, incoming.fullName),
    birthDate: sameDate(current.birthDate, incoming.birthDate) ? null : incoming.birthDate,
    email: contactDiff(current.email, incoming.email, canonicalEmail),
    phone: contactDiff(current.phone, incoming.phone, digitsOnly),
  };
}

export function hasDivergence(divergence: CustomerDivergence): boolean {
  return (
    divergence.fullName !== null ||
    divergence.birthDate !== null ||
    divergence.email !== null ||
    divergence.phone !== null
  );
}

/** Nome só diverge quando muda além de caixa, acento e espaço. Propõe a grafia recebida. */
function nameDiff(current: string, incoming: string): string | null {
  const proposed = incoming.trim();
  return canonicalName(current) === canonicalName(proposed) ? null : proposed;
}

/**
 * Contato (e-mail/telefone) diverge quando o recebido tem valor e sua forma canônica
 * difere da atual. Recebido vazio nunca propõe apagar; atual vazio + recebido com valor
 * conta como divergência (passou a existir). Propõe o valor recebido, só aparado.
 */
function contactDiff(
  current: string | null,
  incoming: string | null,
  canonical: (value: string) => string,
): string | null {
  const proposed = (incoming ?? '').trim();
  if (canonical(proposed) === '') return null;
  return canonical(current ?? '') === canonical(proposed) ? null : proposed;
}

function canonicalName(value: string): string {
  return stripDiacritics(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function canonicalEmail(value: string): string {
  return value.trim().toLowerCase();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function sameDate(a: LocalDate, b: LocalDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

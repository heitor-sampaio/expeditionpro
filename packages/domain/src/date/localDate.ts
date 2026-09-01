/**
 * Data civil sem fuso. Um par (ano, mês, dia), não um instante no tempo.
 *
 * `Date` só existe nas bordas do sistema (§10.2). No domínio, data é explícita e
 * sem fuso implícito — é o que impede a idade de um participante mudar conforme o
 * fuso do servidor, o erro clássico que o PRD manda evitar (§3.4).
 */

export interface LocalDate {
  readonly year: number;
  readonly month: number; // 1–12
  readonly day: number; // 1–31
}

export class InvalidLocalDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLocalDateError';
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseLocalDate(iso: string): LocalDate {
  const match = ISO_DATE.exec(iso);
  if (!match) {
    throw new InvalidLocalDateError(`Data deve estar em ISO YYYY-MM-DD; recebido: "${iso}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new InvalidLocalDateError(`Data inexistente no calendário: "${iso}"`);
  }
  return { year, month, day };
}

/** Exibição pt-BR: `2026-08-27` → `27/08/2026`. */
export function formatLocalDateBR(date: LocalDate): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.day)}/${pad(date.month)}/${date.year}`;
}

/**
 * Anos completos entre `start` e `reference`. É a idade na data de referência.
 * Quem faz aniversário em 29/02 completa idade em 01/03 nos anos não-bissextos —
 * convenção estável e testada.
 */
export function fullYearsBetween(start: LocalDate, reference: LocalDate): number {
  let years = reference.year - start.year;
  if (!hasReachedAnniversary(start, reference)) {
    years -= 1;
  }
  return years;
}

/** Soma dias a uma data civil (aritmética por UTC, sem fuso). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Soma meses a uma data civil; se o dia não existe no mês alvo, cai no último dia. */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const total = date.month - 1 + months;
  const year = date.year + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12; // 0–11
  const lastDay = daysInMonth(year, month + 1);
  return { year, month: month + 1, day: Math.min(date.day, lastDay) };
}

/** Compara duas datas civis: negativo se a < b, zero se iguais, positivo se a > b. */
export function compareLocalDate(a: LocalDate, b: LocalDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function hasReachedAnniversary(start: LocalDate, reference: LocalDate): boolean {
  let anniversaryMonth = start.month;
  let anniversaryDay = start.day;
  // Nascido em 29/02: em ano sem 29 de fevereiro, o aniversário conta a partir
  // de 01/03. Em 28/02 ainda não completou (convenção estável e testada).
  if (start.month === 2 && start.day === 29 && !isLeapYear(reference.year)) {
    anniversaryMonth = 3;
    anniversaryDay = 1;
  }
  if (reference.month !== anniversaryMonth) {
    return reference.month > anniversaryMonth;
  }
  return reference.day >= anniversaryDay;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

import type { LocalDate } from '@expedition/domain';

/** Converte um `Date` (relógio) para `LocalDate` em UTC — a data civil sem fuso implícito. */
export function toLocalDate(date: Date): LocalDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

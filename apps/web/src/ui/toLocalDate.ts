import type { LocalDate } from '@expedition/domain';

/**
 * O dia de hoje no relógio de quem está olhando a tela. É o único ponto do front que
 * transforma `Date` em data de calendário: converter por UTC atrasaria um dia no Brasil
 * a partir das 21h, e o check-in abre no dia da saída.
 */
export function toLocalDate(date: Date): LocalDate {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

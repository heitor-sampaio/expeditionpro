import { describe, it, expect } from 'vitest';
import {
  parseLocalDate,
  formatLocalDateBR,
  fullYearsBetween,
  InvalidLocalDateError,
} from './localDate.js';

/**
 * Data de calendário sem fuso. `birth_date` e a data de início do grupo são datas
 * civis — "14 de janeiro de 1989", não um instante. Tratar como `Date` com fuso faz
 * uma criança nascida à meia-noite mudar de faixa etária conforme o servidor. O PRD
 * calcula idade SEMPRE na data de início do grupo (§3.4); aqui mora essa aritmética.
 */
describe('LocalDate — data civil sem fuso', () => {
  it('formatLocalDateBR exibe dd/mm/aaaa com zero à esquerda', () => {
    expect(formatLocalDateBR(parseLocalDate('1989-01-14'))).toBe('14/01/1989');
    expect(formatLocalDateBR(parseLocalDate('2026-12-05'))).toBe('05/12/2026');
  });

  it('parseLocalDate aceita ISO YYYY-MM-DD', () => {
    const d = parseLocalDate('1989-01-14');
    expect(d.year).toBe(1989);
    expect(d.month).toBe(1);
    expect(d.day).toBe(14);
  });

  it('parseLocalDate rejeita formato inválido e data impossível', () => {
    expect(() => parseLocalDate('14/01/1989')).toThrow(InvalidLocalDateError);
    expect(() => parseLocalDate('1989-13-01')).toThrow(InvalidLocalDateError);
    expect(() => parseLocalDate('2025-02-30')).toThrow(InvalidLocalDateError);
    expect(() => parseLocalDate('')).toThrow(InvalidLocalDateError);
  });

  it('fullYearsBetween conta anos completos na data de referência', () => {
    const birth = parseLocalDate('2015-03-22');
    // véspera do aniversário: ainda 9
    expect(fullYearsBetween(birth, parseLocalDate('2025-03-21'))).toBe(9);
    // no aniversário: 10
    expect(fullYearsBetween(birth, parseLocalDate('2025-03-22'))).toBe(10);
    // depois: 10
    expect(fullYearsBetween(birth, parseLocalDate('2025-12-31'))).toBe(10);
  });

  it('fullYearsBetween trata 29 de fevereiro sem estourar', () => {
    const birth = parseLocalDate('2016-02-29');
    // 2025 não é bissexto: completa no dia 28? Convenção: aniversário em 01/03.
    expect(fullYearsBetween(birth, parseLocalDate('2025-02-28'))).toBe(8);
    expect(fullYearsBetween(birth, parseLocalDate('2025-03-01'))).toBe(9);
  });
});

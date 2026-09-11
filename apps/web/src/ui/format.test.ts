import { describe, it, expect } from 'vitest';
import { formatDateRangeLong } from './format.js';

/**
 * A data da saída no modal de inscrição precisa ser lida sem ambiguidade — é o que o
 * cliente confere antes de confirmar. Por extenso, com ano, e sem repetir o que já está
 * claro (mesmo mês não precisa aparecer duas vezes).
 */
describe('data da expedição por extenso', () => {
  it('mesmo mês: "28 a 30 de agosto de 2026"', () => {
    expect(formatDateRangeLong('2026-08-28', '2026-08-30')).toBe('28 a 30 de agosto de 2026');
  });

  it('meses diferentes repetem o mês, não o ano', () => {
    expect(formatDateRangeLong('2026-08-30', '2026-09-02')).toBe(
      '30 de agosto a 2 de setembro de 2026',
    );
  });

  it('anos diferentes repetem tudo', () => {
    expect(formatDateRangeLong('2026-12-30', '2027-01-02')).toBe(
      '30 de dezembro de 2026 a 2 de janeiro de 2027',
    );
  });

  it('saída de um dia só não vira intervalo', () => {
    expect(formatDateRangeLong('2026-08-28', '2026-08-28')).toBe('28 de agosto de 2026');
  });
});

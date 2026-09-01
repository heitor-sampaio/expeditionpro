import { describe, it, expect } from 'vitest';
import { brDateToIso } from './dateFields.js';

/**
 * O DTO do back-office exibe a data em BR (`dd/mm/aaaa`), mas `<input type="date">` só
 * entende ISO. A conversão é de borda de UI — sem fuso, sem `Date`: só recorta a string.
 */
describe('CL-06: data exibida em BR → valor do campo de data', () => {
  it('converte dd/mm/aaaa para aaaa-mm-dd', () => {
    expect(brDateToIso('22/03/2015')).toBe('2015-03-22');
    expect(brDateToIso('05/12/2026')).toBe('2026-12-05');
  });

  it('valor já em ISO passa direto (a API pode mudar sem quebrar o campo)', () => {
    expect(brDateToIso('2015-03-22')).toBe('2015-03-22');
  });

  it('vazio ou formato estranho vira vazio — campo em branco, nunca "Invalid Date"', () => {
    expect(brDateToIso('')).toBe('');
    expect(brDateToIso('22-03-2015')).toBe('');
    expect(brDateToIso('ontem')).toBe('');
  });
});

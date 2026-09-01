import { describe, it, expect } from 'vitest';
import { normalizeCep, isValidCep, formatCep } from './cep.js';

/**
 * CEP é validação "só formato" (§5.7.1): dá para dizer que está malformado, não que
 * existe. Malformado em campo opcional não bloqueia — só sinaliza. Guardado só dígitos.
 */
describe('CL-02: CEP — normalização e formato', () => {
  it('normalizeCep remove pontuação e espaço, deixando só dígitos', () => {
    expect(normalizeCep('88036-100')).toBe('88036100');
    expect(normalizeCep('  88036 100 ')).toBe('88036100');
    expect(normalizeCep('88036100')).toBe('88036100');
  });

  it('isValidCep exige exatamente 8 dígitos', () => {
    expect(isValidCep('88036-100')).toBe(true);
    expect(isValidCep('8803610')).toBe(false); // 7
    expect(isValidCep('880361000')).toBe(false); // 9
    expect(isValidCep('8803610a')).toBe(false);
    expect(isValidCep('')).toBe(false);
  });

  it('formatCep pontua para exibição', () => {
    expect(formatCep('88036100')).toBe('88036-100');
    expect(formatCep('88036-100')).toBe('88036-100');
  });
});

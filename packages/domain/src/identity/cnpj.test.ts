import { describe, expect, it } from 'vitest';
import { isValidCnpj, parseCnpj, formatCnpj, InvalidCnpjError } from './cnpj.js';

/**
 * FO-01/FO-03 — CNPJ do fornecedor com dígito verificador. Value object branded, como o
 * CPF: depois do parse, os 14 dígitos são verdade.
 */
describe('FO-01: CNPJ com dígito verificador', () => {
  it('aceita um CNPJ válido, guardando só dígitos', () => {
    expect(parseCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(isValidCnpj('11222333000181')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(isValidCnpj('11222333000182')).toBe(false);
    expect(() => parseCnpj('11222333000182')).toThrow(InvalidCnpjError);
  });

  it('recusa comprimento errado e sequência repetida', () => {
    expect(isValidCnpj('1122233300018')).toBe(false); // 13 dígitos
    expect(isValidCnpj('00000000000000')).toBe(false);
  });

  it('formata pontuado para a ficha', () => {
    expect(formatCnpj(parseCnpj('11222333000181'))).toBe('11.222.333/0001-81');
  });
});

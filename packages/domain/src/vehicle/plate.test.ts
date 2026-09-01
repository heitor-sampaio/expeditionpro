import { describe, it, expect } from 'vitest';
import { parsePlate, isValidPlate, formatPlate, InvalidPlateError } from './plate.js';

/**
 * Placa nos dois formatos que circulam no Brasil (§3.3 / CL-05): antigo ABC1234 e
 * Mercosul ABC1D23. Normalizada em caixa alta e sem separador para casar sempre.
 */
describe('CL-05: placa — formatos antigo e Mercosul', () => {
  it('parsePlate normaliza caixa e remove separador/espaço', () => {
    expect(parsePlate('abc-1234')).toBe('ABC1234');
    expect(parsePlate('  abc1d23 ')).toBe('ABC1D23');
  });

  it('parsePlate aceita o formato antigo (ABC1234)', () => {
    expect(parsePlate('SFG0H61')).toBe('SFG0H61'); // Mercosul do exemplo do PRD
    expect(parsePlate('ABC1234')).toBe('ABC1234');
  });

  it('parsePlate aceita o formato Mercosul (ABC1D23)', () => {
    expect(parsePlate('ABC1D23')).toBe('ABC1D23');
  });

  it('parsePlate rejeita formatos inválidos', () => {
    expect(() => parsePlate('AB1234')).toThrow(InvalidPlateError); // letras de menos
    expect(() => parsePlate('ABCD123')).toThrow(InvalidPlateError); // 4 letras
    expect(() => parsePlate('ABC12345')).toThrow(InvalidPlateError); // dígito a mais
    expect(() => parsePlate('1BC1234')).toThrow(InvalidPlateError); // começa com número
    expect(() => parsePlate('')).toThrow(InvalidPlateError);
  });

  it('isValidPlate devolve booleano sem lançar', () => {
    expect(isValidPlate('abc-1234')).toBe(true);
    expect(isValidPlate('ABC1D23')).toBe(true);
    expect(isValidPlate('nada')).toBe(false);
  });

  it('formatPlate pontua o formato antigo e mantém o Mercosul', () => {
    expect(formatPlate(parsePlate('ABC1234'))).toBe('ABC-1234');
    expect(formatPlate(parsePlate('ABC1D23'))).toBe('ABC1D23');
  });
});

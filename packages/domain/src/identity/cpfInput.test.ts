import { describe, expect, it } from 'vitest';
import { formatCpfInput } from './cpfInput.js';

describe('CL-01: a máscara do CPF enquanto se digita', () => {
  it('pontua conforme os dígitos entram', () => {
    expect(formatCpfInput('9')).toBe('9');
    expect(formatCpfInput('900')).toBe('900');
    expect(formatCpfInput('9000')).toBe('900.0');
    expect(formatCpfInput('900000')).toBe('900.000');
    expect(formatCpfInput('9000001')).toBe('900.000.1');
    expect(formatCpfInput('900000100')).toBe('900.000.100');
    expect(formatCpfInput('9000001005')).toBe('900.000.100-5');
    expect(formatCpfInput('90000010057')).toBe('900.000.100-57');
  });

  /**
   * Apagar tem de andar para trás. Sem isto, apagar o dígito depois de um ponto devolveria o
   * ponto na hora e o cursor ficaria preso — o defeito clássico de campo com máscara.
   */
  it('não devolve o separador quando o dígito seguinte sai', () => {
    expect(formatCpfInput('900.')).toBe('900');
    expect(formatCpfInput('900.000.')).toBe('900.000');
    expect(formatCpfInput('900.000.100-')).toBe('900.000.100');
  });

  it('ignora o que não é dígito, venha colado de onde vier', () => {
    expect(formatCpfInput('900.000.100-57')).toBe('900.000.100-57');
    expect(formatCpfInput('900 000 100 57')).toBe('900.000.100-57');
    expect(formatCpfInput('abc900def000')).toBe('900.000');
  });

  /** CPF tem onze dígitos: o décimo segundo é engano de digitação, e não entra. */
  it('para nos onze dígitos', () => {
    expect(formatCpfInput('900000100571234')).toBe('900.000.100-57');
  });

  it('campo vazio continua vazio — placeholder é trabalho do campo', () => {
    expect(formatCpfInput('')).toBe('');
    expect(formatCpfInput('...')).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import { parseCpf, isValidCpf, formatCpf, maskCpf, InvalidCpfError } from './cpf.js';

/**
 * CPF é a chave de identidade, de deduplicação e de dedup do webhook (§3.8). Se o
 * validador deixar passar um CPF inválido, ele contamina a unicidade `(tenant_id, cpf)`
 * e o matching da fila de alocação (IN-03). Por isso é o alicerce do cadastro.
 */
describe('CL-01: CPF — normalização e validação por dígito verificador', () => {
  it('parseCpf normaliza removendo pontuação e devolve só os 11 dígitos', () => {
    expect(parseCpf('900.000.100-57')).toBe('90000010057');
    expect(parseCpf('  900000100 57 ')).toBe('90000010057');
  });

  it('parseCpf aceita CPFs válidos (dígitos verificadores corretos)', () => {
    expect(parseCpf('90000010057')).toBe('90000010057');
    expect(parseCpf('12345678909')).toBe('12345678909');
  });

  it('parseCpf rejeita dígito verificador errado', () => {
    expect(() => parseCpf('90000010000')).toThrow(InvalidCpfError);
    expect(() => parseCpf('12345678901')).toThrow(InvalidCpfError);
  });

  it('parseCpf rejeita sequência de dígitos repetidos (passa na conta, mas é inválido)', () => {
    expect(() => parseCpf('00000000000')).toThrow(InvalidCpfError);
    expect(() => parseCpf('11111111111')).toThrow(InvalidCpfError);
  });

  it('parseCpf rejeita comprimento errado e caracteres não numéricos', () => {
    expect(() => parseCpf('123')).toThrow(InvalidCpfError);
    expect(() => parseCpf('900000100572')).toThrow(InvalidCpfError);
    expect(() => parseCpf('900000100ab')).toThrow(InvalidCpfError);
    expect(() => parseCpf('')).toThrow(InvalidCpfError);
  });

  it('isValidCpf devolve booleano sem lançar', () => {
    expect(isValidCpf('900.000.100-57')).toBe(true);
    expect(isValidCpf('12345678901')).toBe(false);
    expect(isValidCpf('')).toBe(false);
  });
});

describe('CL-08: CPF — formatação e mascaramento', () => {
  it('formatCpf devolve o CPF completo pontuado (para a ficha)', () => {
    expect(formatCpf(parseCpf('90000010057'))).toBe('900.000.100-57');
  });

  it('maskCpf esconde o miolo, revelando só o início e os dígitos verificadores (para listagens)', () => {
    expect(maskCpf(parseCpf('90000010057'))).toBe('900.***.***-57');
  });
});

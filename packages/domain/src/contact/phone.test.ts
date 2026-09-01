import { describe, it, expect } from 'vitest';
import { parsePhone, isValidPhone, formatPhone, InvalidPhoneError } from './phone.js';

describe('§3.2: telefone em E.164', () => {
  it('normaliza celular nacional (11 díg.) adicionando o DDI 55', () => {
    expect(parsePhone('(48) 99999-8877')).toBe('5548999998877');
  });

  it('normaliza fixo nacional (10 díg.)', () => {
    expect(parsePhone('48 3154-3707')).toBe('554831543707');
  });

  it('mantém quando já vem com o DDI 55', () => {
    expect(parsePhone('+55 (48) 99999-8877')).toBe('5548999998877');
  });

  it('rejeita comprimento fora do padrão', () => {
    expect(() => parsePhone('12345')).toThrow(InvalidPhoneError);
    expect(isValidPhone('12345')).toBe(false);
    expect(isValidPhone('(48) 99999-8877')).toBe(true);
  });

  it('formata celular e fixo para exibição', () => {
    expect(formatPhone('5548999998877')).toBe('+55 (48)99999-8877');
    expect(formatPhone('554831543707')).toBe('+55 (48)3154-3707');
  });

  it('GR-15: telefone legado sem DDI também é formatado', () => {
    // Cadastro antigo, anterior à normalização E.164, guardou só DDD + número. Ele sai
    // em documento que vai para fora da empresa (roomlist): não pode aparecer cru.
    expect(formatPhone('48999998877')).toBe('+55 (48)99999-8877');
    expect(formatPhone('4831543707')).toBe('+55 (48)3154-3707');
  });

  it('formatação fora do padrão volta como veio', () => {
    expect(formatPhone('123')).toBe('123');
    expect(formatPhone('')).toBe('');
  });
});

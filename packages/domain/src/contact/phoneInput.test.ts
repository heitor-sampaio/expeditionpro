import { describe, expect, it } from 'vitest';
import { formatPhoneInput } from './phoneInput.js';

describe('§3.2: a máscara do telefone enquanto se digita', () => {
  it('abre o parêntese no DDD e separa o número', () => {
    expect(formatPhoneInput('4')).toBe('(4');
    // O parêntese fecha junto com o terceiro dígito, não com o segundo: fechá-lo antes
    // prenderia o cursor — apagar devolveria o ')' na hora, e nada sairia da tela.
    expect(formatPhoneInput('48')).toBe('(48');
    expect(formatPhoneInput('489')).toBe('(48) 9');
    expect(formatPhoneInput('489999')).toBe('(48) 9999');
    expect(formatPhoneInput('4899999')).toBe('(48) 99999');
    expect(formatPhoneInput('48999998')).toBe('(48) 99999-8');
    expect(formatPhoneInput('48999998877')).toBe('(48) 99999-8877');
  });

  /** Fixo tem oito dígitos depois do DDD, e o hífen cai um lugar antes. */
  it('fixo de oito dígitos fecha no lugar certo', () => {
    expect(formatPhoneInput('4833334444')).toBe('(48) 3333-4444');
  });

  /** Apagar tem de andar para trás, senão o separador volta sozinho e prende o cursor. */
  it('não devolve o separador quando o dígito seguinte sai', () => {
    expect(formatPhoneInput('(48)')).toBe('(48');
    expect(formatPhoneInput('(48) ')).toBe('(48');
    expect(formatPhoneInput('(4')).toBe('(4');
  });

  /**
   * Quem copia do WhatsApp cola `+55 48 99999-8877`. Sem tirar o DDI, o 55 viraria o DDD e o
   * número inteiro andaria dois dígitos — errado de um jeito que a pessoa não percebe.
   */
  it('tira o 55 de quem colou com DDI', () => {
    expect(formatPhoneInput('+5548999998877')).toBe('(48) 99999-8877');
    expect(formatPhoneInput('5548999998877')).toBe('(48) 99999-8877');
  });

  /** DDD 55 é Santa Maria e existe: um número de onze dígitos começando em 55 fica inteiro. */
  it('não confunde o DDD 55 com o código do país', () => {
    expect(formatPhoneInput('55999998877')).toBe('(55) 99999-8877');
  });

  it('para nos onze dígitos', () => {
    expect(formatPhoneInput('489999988771234')).toBe('(48) 99999-8877');
  });

  it('campo vazio continua vazio', () => {
    expect(formatPhoneInput('')).toBe('');
    expect(formatPhoneInput('()- ')).toBe('');
  });
});

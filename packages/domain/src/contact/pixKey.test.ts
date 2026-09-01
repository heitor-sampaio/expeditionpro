import { describe, expect, it } from 'vitest';
import { formatPixKey, InvalidPixKeyError, parsePixKey } from './pixKey.js';

/**
 * FO-07 — a chave PIX do fornecedor. Chave errada é dinheiro no bolso de outra pessoa, e
 * a transferência não volta sozinha: é o campo do cadastro com o pior custo de erro.
 *
 * O tipo é **descoberto**, não escolhido: o fornecedor manda a chave por WhatsApp e a
 * equipe cola. Pedir para classificar antes de colar é trabalho que o computador faz
 * melhor — e um seletor errado ao lado de uma chave certa é um jeito novo de errar.
 */

describe('FO-07: reconhecer o tipo da chave', () => {
  it('CPF com dígito verificador válido', () => {
    expect(parsePixKey('900.000.100-57')).toEqual({ type: 'cpf', value: '90000010057' });
  });

  it('CNPJ', () => {
    expect(parsePixKey('19.131.243/0001-97')).toEqual({ type: 'cnpj', value: '19131243000197' });
  });

  it('e-mail, sempre em caixa baixa', () => {
    expect(parsePixKey('  Contato@Pousada.COM.br ')).toEqual({
      type: 'email',
      value: 'contato@pousada.com.br',
    });
  });

  it('telefone vira E.164, como o resto do sistema guarda', () => {
    expect(parsePixKey('(48) 99999-8877')).toEqual({ type: 'phone', value: '5548999998877' });
  });

  it('chave aleatória (EVP) em caixa baixa', () => {
    expect(parsePixKey('E7A9F2C4-1B3D-4E5F-8A6B-9C0D1E2F3A4B')).toEqual({
      type: 'random',
      value: 'e7a9f2c4-1b3d-4e5f-8a6b-9c0d1e2f3a4b',
    });
  });
});

describe('FO-07: onze dígitos são ambíguos — CPF e celular têm o mesmo tamanho', () => {
  /**
   * `04241588921` é CPF válido; `48999998877` não é, mas é um celular de Florianópolis.
   * A regra: onze dígitos tentam CPF primeiro e, se o dígito verificador não fecha, caem
   * em telefone. Sem isso, a equipe colaria o celular do fornecedor e ouviria "CPF
   * inválido" para um número que está certo.
   */
  it('onze dígitos que passam no dígito verificador são CPF', () => {
    expect(parsePixKey('04241588921')).toEqual({ type: 'cpf', value: '04241588921' });
  });

  it('onze dígitos que não fecham como CPF viram telefone', () => {
    expect(parsePixKey('48999998877')).toEqual({ type: 'phone', value: '5548999998877' });
  });

  it('com o +55 na frente não há ambiguidade', () => {
    expect(parsePixKey('+55 48 99999-8877')).toEqual({ type: 'phone', value: '5548999998877' });
  });
});

describe('FO-07: o que não é chave', () => {
  it('texto solto', () => {
    expect(() => parsePixKey('a chave da pousada')).toThrow(InvalidPixKeyError);
  });

  it('vazio', () => {
    expect(() => parsePixKey('   ')).toThrow(InvalidPixKeyError);
  });

  it('e-mail sem domínio', () => {
    expect(() => parsePixKey('contato@')).toThrow(InvalidPixKeyError);
  });

  it('sequência de dígitos que não é documento nem telefone', () => {
    expect(() => parsePixKey('123')).toThrow(InvalidPixKeyError);
  });

  it('CPF com dígito verificador errado e tamanho de CPF não vira telefone válido', () => {
    // 11 dígitos que falham no CPF **e** cujo DDD não existe continuam recusados.
    expect(() => parsePixKey('00000000000')).toThrow(InvalidPixKeyError);
  });
});

describe('FO-07: como a chave aparece para quem vai pagar', () => {
  it('CPF sai pontuado', () => {
    expect(formatPixKey({ type: 'cpf', value: '90000010057' })).toBe('900.000.100-57');
  });

  it('CNPJ sai pontuado', () => {
    expect(formatPixKey({ type: 'cnpj', value: '19131243000197' })).toBe('19.131.243/0001-97');
  });

  it('telefone sai legível', () => {
    expect(formatPixKey({ type: 'phone', value: '5548999998877' })).toBe('+55 (48)99999-8877');
  });

  it('e-mail e chave aleatória saem como estão — copiar e colar é o uso', () => {
    expect(formatPixKey({ type: 'email', value: 'contato@pousada.com.br' })).toBe(
      'contato@pousada.com.br',
    );
    expect(formatPixKey({ type: 'random', value: 'e7a9f2c4-1b3d-4e5f-8a6b-9c0d1e2f3a4b' })).toBe(
      'e7a9f2c4-1b3d-4e5f-8a6b-9c0d1e2f3a4b',
    );
  });
});

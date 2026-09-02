import { describe, expect, it } from 'vitest';
import { maskPixKey, parsePixKey } from './pixKey.js';

/**
 * FO-07 · A09 — a chave PIX mascarada, para a trilha de auditoria.
 *
 * Trocar a chave PIX de um fornecedor redireciona pagamento: é a alteração de cadastro
 * com maior potencial de fraude no sistema, e precisa deixar rastro. Mas a trilha não
 * pode guardar a chave crua — ela costuma **ser** um CPF, um telefone ou um e-mail, e a
 * regra da trilha é explícita: dado pessoal só entra mascarado.
 *
 * O que a investigação precisa é reconhecer, não reconstituir: saber que a chave mudou
 * de um CPF terminado em 57 para um e-mail em outro domínio já denuncia o desvio.
 */
describe('FO-07: máscara da chave PIX para a trilha', () => {
  it('CPF revela só os dígitos verificadores, como o resto do sistema', () => {
    expect(maskPixKey(parsePixKey('900.000.100-57'))).toBe('900.***.***-57');
  });

  it('CNPJ revela só o fim', () => {
    expect(maskPixKey(parsePixKey('19.131.243/0001-97'))).toBe('***0197');
  });

  it('telefone revela só os quatro últimos', () => {
    expect(maskPixKey(parsePixKey('48999998877'))).toBe('***8877');
  });

  it('e-mail preserva o domínio e esconde quem é — é o domínio que denuncia o desvio', () => {
    expect(maskPixKey(parsePixKey('financeiro@pousada.com.br'))).toBe('f***@pousada.com.br');
  });

  it('e-mail de uma letra não vaza a letra inteira ao esconder', () => {
    expect(maskPixKey(parsePixKey('a@pousada.com'))).toBe('***@pousada.com');
  });

  it('chave aleatória revela só o fim — é UUID, não identifica pessoa, mas a regra é uma só', () => {
    expect(maskPixKey(parsePixKey('9f8e7d6c-1234-4321-abcd-000011112222'))).toBe('***2222');
  });
});

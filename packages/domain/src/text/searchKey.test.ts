import { describe, expect, it } from 'vitest';
import { searchKey } from './searchKey.js';

/**
 * CL-02 — a chave de busca. Nome com acento tem de ser achado sem acento, e vice-versa:
 * quem digita "joao" no balcão está com pressa, e "João" é como está no cadastro.
 */
describe('CL-02: chave de busca sem acento', () => {
  it('tira acento e caixa', () => {
    expect(searchKey('João Gonçalves')).toBe('joao goncalves');
    expect(searchKey('ÂNGELA DE ÁVILA')).toBe('angela de avila');
  });

  it.each([
    ['á', 'a'],
    ['ã', 'a'],
    ['â', 'a'],
    ['é', 'e'],
    ['ê', 'e'],
    ['í', 'i'],
    ['ó', 'o'],
    ['õ', 'o'],
    ['ô', 'o'],
    ['ú', 'u'],
    ['ü', 'u'],
    ['ç', 'c'],
    ['ñ', 'n'],
  ])('%s vira %s', (acentuado, plano) => {
    expect(searchKey(acentuado)).toBe(plano);
  });

  it('colapsa espaço repetido e apara as pontas — busca não deve falhar por digitação', () => {
    expect(searchKey('  Ana   Maria  ')).toBe('ana maria');
  });

  it('é idempotente: aplicar de novo não muda', () => {
    const uma = searchKey('José Antônio');
    expect(searchKey(uma)).toBe(uma);
  });

  it('texto já plano passa intacto', () => {
    expect(searchKey('ana maria')).toBe('ana maria');
  });
});

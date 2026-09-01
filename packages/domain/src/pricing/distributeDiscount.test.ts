import { describe, expect, it } from 'vitest';
import { cents, InvalidCentsError, sumCents } from '../money/cents.js';
import { discountFromPercent, distributeDiscount } from './distributeDiscount.js';

/**
 * GR-04 — o desconto de balcão é digitado sobre o **total** da inscrição, mas o que o
 * banco guarda é o unitário congelado de cada participante (§3.4). Esta é a função que
 * faz a ponte, e ela tem uma obrigação inegociável: a soma dos novos unitários é
 * exatamente o total combinado. Um centavo perdido no rateio é uma inscrição que nunca
 * fecha.
 */

describe('GR-04: desconto sobre o total, rateado entre os participantes', () => {
  it('rateia proporcionalmente ao que cada participante vale', () => {
    const novos = distributeDiscount([cents(289000), cents(69000)], cents(35800));

    // 10% de 3.580,00: cada um cai 10% do seu.
    expect(novos).toEqual([cents(260100), cents(62100)]);
  });

  it('a soma dos novos unitários bate exatamente com o total combinado', () => {
    // 1.000,00 em duas partes iguais, desconto de 333,33 — divisão que não fecha redonda.
    const novos = distributeDiscount([cents(50000), cents(50000)], cents(33333));

    expect(sumCents(novos)).toBe(cents(66667));
  });

  it('o centavo que sobra vai para quem tem a maior fração, e a ordem decide o empate', () => {
    const novos = distributeDiscount([cents(50000), cents(50000)], cents(33333));

    // Empate na fração: o primeiro leva o centavo. Determinístico, não "o maior".
    expect(novos).toEqual([cents(33334), cents(33333)]);
  });

  it('desconto zero devolve os unitários intactos', () => {
    const unitarios = [cents(289000), cents(69000)];

    expect(distributeDiscount(unitarios, cents(0))).toEqual(unitarios);
  });

  it('cortesia integral zera todo mundo, sem sobrar centavo em ninguém', () => {
    const novos = distributeDiscount([cents(289000), cents(69000)], cents(358000));

    expect(novos).toEqual([cents(0), cents(0)]);
    expect(sumCents(novos)).toBe(cents(0));
  });

  it('um participante só recebe o desconto inteiro', () => {
    expect(distributeDiscount([cents(120000)], cents(12000))).toEqual([cents(108000)]);
  });

  it('participante de valor zero não recebe pedaço do desconto', () => {
    const novos = distributeDiscount([cents(100000), cents(0)], cents(10000));

    expect(novos).toEqual([cents(90000), cents(0)]);
  });

  it('desconto maior que o total é recusado — não existe inscrição de valor negativo', () => {
    expect(() => distributeDiscount([cents(100000)], cents(100001))).toThrow(InvalidCentsError);
  });

  it('desconto negativo é recusado — para subir o valor existe outro caminho', () => {
    expect(() => distributeDiscount([cents(100000)], cents(-1) as never)).toThrow(
      InvalidCentsError,
    );
  });
});

describe('GR-04: o desconto em percentual', () => {
  it('10% de 3.580,00 são 358,00', () => {
    expect(discountFromPercent(cents(358000), 10)).toBe(cents(35800));
  });

  /**
   * Mesmo raciocínio do cupom (CP-04): centavo que sobra no arredondamento seria desconto
   * **maior** que o combinado, e desconto é dinheiro que não entra. Arredonda para baixo.
   */
  it('arredonda para baixo — o centavo da dúvida fica com a casa', () => {
    // 33% de 1.000,01 = 330,0033
    expect(discountFromPercent(cents(100001), 33)).toBe(cents(33000));
  });

  it('100% é cortesia integral', () => {
    expect(discountFromPercent(cents(358000), 100)).toBe(cents(358000));
  });

  it('percentual fora de 0..100 é recusado', () => {
    expect(() => discountFromPercent(cents(100000), 101)).toThrow(InvalidCentsError);
    expect(() => discountFromPercent(cents(100000), -1)).toThrow(InvalidCentsError);
  });
});

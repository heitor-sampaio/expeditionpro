import { describe, it, expect } from 'vitest';
import { cents } from '../money/cents.js';
import { parseLocalDate } from '../date/localDate.js';
import {
  calculateCouponDiscount,
  checkCoupon,
  normalizeCouponCode,
  InvalidCouponCodeError,
  type Coupon,
  type CouponUsageContext,
} from './coupon.js';

/**
 * Núcleo puro do cupom (§5.15). Aqui só mora a decisão "este cupom vale para esta
 * inscrição?" e "quanto ele abate?" — quem conta os usos e quem grava o resgate é a
 * camada de aplicação. Nada de data corrente escondida: `today` entra por parâmetro.
 */

const ROTEIRO = 'itin-coxilha';
const SAIDA = 'group-agosto';
const CLIENTE = 'cus-heitor';

function coupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    code: 'VERAO10',
    mode: 'percent',
    value: 10,
    active: true,
    validFrom: null,
    validUntil: null,
    maxUses: null,
    maxUsesPerCustomer: null,
    itineraryId: null,
    groupId: null,
    customerId: null,
    ...overrides,
  };
}

function context(overrides: Partial<CouponUsageContext> = {}): CouponUsageContext {
  return {
    today: parseLocalDate('2026-08-30'),
    itineraryId: ROTEIRO,
    groupId: SAIDA,
    responsibleCustomerId: CLIENTE,
    usesTotal: 0,
    usesByCustomer: 0,
    ...overrides,
  };
}

describe('CP-01: código do cupom', () => {
  it('normaliza para caixa alta sem espaço nas bordas', () => {
    expect(normalizeCouponCode(' verao10 ')).toBe('VERAO10');
    expect(normalizeCouponCode('Black-Friday')).toBe('BLACK-FRIDAY');
  });

  it('recusa código vazio, curto demais, longo demais ou fora de A-Z 0-9 e hífen', () => {
    expect(() => normalizeCouponCode('   ')).toThrow(InvalidCouponCodeError);
    expect(() => normalizeCouponCode('AB')).toThrow(InvalidCouponCodeError);
    expect(() => normalizeCouponCode('A'.repeat(25))).toThrow(InvalidCouponCodeError);
    // acento e espaço interno tornam o código impossível de ditar por telefone
    expect(() => normalizeCouponCode('VERÃO10')).toThrow(InvalidCouponCodeError);
    expect(() => normalizeCouponCode('VERAO 10')).toThrow(InvalidCouponCodeError);
    expect(() => normalizeCouponCode('VERAO@10')).toThrow(InvalidCouponCodeError);
  });
});

describe('CP-01: desconto percentual ou valor fixo', () => {
  it('percentual arredonda para baixo', () => {
    // 10% de R$ 2.599,90 = R$ 259,99
    expect(calculateCouponDiscount(cents(2_599_90), coupon({ mode: 'percent', value: 10 }))).toBe(
      259_99,
    );
    // 5% de R$ 199,90 = R$ 9,995 → R$ 9,99
    expect(calculateCouponDiscount(cents(199_90), coupon({ mode: 'percent', value: 5 }))).toBe(999);
  });

  it('valor fixo abate o valor declarado', () => {
    expect(calculateCouponDiscount(cents(2_000_00), coupon({ mode: 'fixed', value: 300_00 }))).toBe(
      300_00,
    );
  });

  it('nunca abate mais que o próprio valor — desconto não vira crédito', () => {
    expect(calculateCouponDiscount(cents(200_00), coupon({ mode: 'fixed', value: 300_00 }))).toBe(
      200_00,
    );
    expect(calculateCouponDiscount(cents(200_00), coupon({ mode: 'percent', value: 150 }))).toBe(
      200_00,
    );
  });

  it('valor zerado ou base zerada não abate nada', () => {
    expect(calculateCouponDiscount(cents(0), coupon({ mode: 'percent', value: 10 }))).toBe(0);
    expect(calculateCouponDiscount(cents(2_000_00), coupon({ mode: 'fixed', value: 0 }))).toBe(0);
  });
});

describe('CP-01: cupom ativo e dentro da validade', () => {
  it('aceita o cupom ativo sem janela declarada', () => {
    expect(checkCoupon(coupon(), context())).toEqual({ ok: true });
  });

  it('recusa cupom desativado', () => {
    expect(checkCoupon(coupon({ active: false }), context())).toEqual({
      ok: false,
      reason: 'inactive',
    });
  });

  it('recusa antes de começar e depois de vencer, e aceita nas bordas', () => {
    const janela = coupon({
      validFrom: parseLocalDate('2026-08-01'),
      validUntil: parseLocalDate('2026-08-31'),
    });
    expect(checkCoupon(janela, context({ today: parseLocalDate('2026-07-31') }))).toEqual({
      ok: false,
      reason: 'not_started',
    });
    expect(checkCoupon(janela, context({ today: parseLocalDate('2026-09-01') }))).toEqual({
      ok: false,
      reason: 'expired',
    });
    // o dia de início e o de término são dias válidos
    expect(checkCoupon(janela, context({ today: parseLocalDate('2026-08-01') }))).toEqual({
      ok: true,
    });
    expect(checkCoupon(janela, context({ today: parseLocalDate('2026-08-31') }))).toEqual({
      ok: true,
    });
  });
});

describe('CP-02: escopo por roteiro ou por saída', () => {
  it('cupom de um roteiro só vale naquele roteiro', () => {
    const doRoteiro = coupon({ itineraryId: ROTEIRO });
    expect(checkCoupon(doRoteiro, context())).toEqual({ ok: true });
    expect(checkCoupon(doRoteiro, context({ itineraryId: 'itin-vale-europeu' }))).toEqual({
      ok: false,
      reason: 'itinerary_not_allowed',
    });
  });

  it('cupom de uma saída só vale naquela saída', () => {
    const daSaida = coupon({ groupId: SAIDA });
    expect(checkCoupon(daSaida, context())).toEqual({ ok: true });
    expect(checkCoupon(daSaida, context({ groupId: 'group-setembro' }))).toEqual({
      ok: false,
      reason: 'group_not_allowed',
    });
  });
});

describe('CP-03: cupom nominal', () => {
  it('só o cliente nomeado aplica', () => {
    const nominal = coupon({ customerId: CLIENTE });
    expect(checkCoupon(nominal, context())).toEqual({ ok: true });
    expect(checkCoupon(nominal, context({ responsibleCustomerId: 'cus-outro' }))).toEqual({
      ok: false,
      reason: 'not_for_this_customer',
    });
  });
});

describe('CP-04: limite de usos', () => {
  it('recusa quando o limite total foi atingido', () => {
    const limitado = coupon({ maxUses: 50 });
    expect(checkCoupon(limitado, context({ usesTotal: 49 }))).toEqual({ ok: true });
    expect(checkCoupon(limitado, context({ usesTotal: 50 }))).toEqual({
      ok: false,
      reason: 'exhausted',
    });
  });

  it('recusa quando o cliente já usou o que podia', () => {
    const porCliente = coupon({ maxUsesPerCustomer: 1 });
    expect(checkCoupon(porCliente, context({ usesByCustomer: 0 }))).toEqual({ ok: true });
    expect(checkCoupon(porCliente, context({ usesByCustomer: 1 }))).toEqual({
      ok: false,
      reason: 'customer_limit_reached',
    });
  });

  it('sem limite declarado, uso livre', () => {
    expect(checkCoupon(coupon(), context({ usesTotal: 9_999, usesByCustomer: 9_999 }))).toEqual({
      ok: true,
    });
  });
});

describe('CP-01: precedência do motivo', () => {
  it('cupom desativado responde "inactive" mesmo estando vencido e esgotado', () => {
    const morto = coupon({
      active: false,
      validUntil: parseLocalDate('2020-01-01'),
      maxUses: 1,
    });
    expect(checkCoupon(morto, context({ usesTotal: 5 }))).toEqual({
      ok: false,
      reason: 'inactive',
    });
  });
});

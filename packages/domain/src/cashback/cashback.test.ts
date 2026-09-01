import { describe, it, expect } from 'vitest';
import { cents } from '../money/cents.js';
import {
  calculateCashback,
  cashbackAppliesToSource,
  resolveCashbackRule,
  BOOKING_SOURCE,
  type CashbackConfig,
} from './cashback.js';

/**
 * Núcleo de cashback (§5.8). Dinheiro que a empresa deve ao cliente — 100% cobertura.
 * A regra resolve a partir da config da empresa + override do grupo (inherit/off/custom).
 */

const config = (over: Partial<CashbackConfig> = {}): CashbackConfig => ({
  enabled: true,
  mode: 'percent',
  value: 5,
  base: 'paid',
  releaseDays: 30,
  validityMonths: 12,
  maxRedemptionPct: 50,
  ...over,
});

describe('CB-01: calculateCashback — percentual ou valor fixo', () => {
  it('percentual sobre a base, arredondado ao centavo', () => {
    expect(calculateCashback(cents(200000), { mode: 'percent', value: 5 })).toBe(10000);
    expect(calculateCashback(cents(30000), { mode: 'percent', value: 33.3 })).toBe(9990);
  });

  it('valor fixo ignora a base', () => {
    expect(calculateCashback(cents(200000), { mode: 'fixed', value: 30000 })).toBe(30000);
    expect(calculateCashback(cents(0), { mode: 'fixed', value: 30000 })).toBe(30000);
  });

  it('valor zero gera crédito zero', () => {
    expect(calculateCashback(cents(200000), { mode: 'percent', value: 0 })).toBe(0);
  });
});

describe('CB-02: resolveCashbackRule — config + override do grupo', () => {
  it('inherit com módulo ligado usa a regra da empresa', () => {
    const rule = resolveCashbackRule(config(), { kind: 'inherit' });
    expect(rule).not.toBeNull();
    expect(rule!.mode).toBe('percent');
    expect(rule!.value).toBe(5);
  });

  it('inherit com módulo desligado não gera crédito', () => {
    expect(resolveCashbackRule(config({ enabled: false }), { kind: 'inherit' })).toBeNull();
  });

  it('off nunca gera crédito, mesmo com módulo ligado', () => {
    expect(resolveCashbackRule(config(), { kind: 'off' })).toBeNull();
  });

  it('custom é campanha: vale mesmo com o módulo geral desligado', () => {
    const rule = resolveCashbackRule(config({ enabled: false }), {
      kind: 'custom',
      rule: {
        mode: 'fixed',
        value: 30000,
        base: 'contracted',
        releaseDays: 0,
        validityMonths: 0,
        maxRedemptionPct: 0,
      },
    });
    expect(rule).not.toBeNull();
    expect(rule!.mode).toBe('fixed');
    expect(rule!.value).toBe(30000);
    expect(rule!.base).toBe('contracted');
  });
});

describe('§5.8: cashback só na auto-inscrição do cliente pelo portal', () => {
  it('só a origem `portal` (o cliente se inscreve pelo app) é elegível', () => {
    expect(cashbackAppliesToSource(BOOKING_SOURCE.portal)).toBe(true);
  });

  it('inscrição da equipe (manual) e do webhook não geram cashback', () => {
    expect(cashbackAppliesToSource(BOOKING_SOURCE.manual)).toBe(false);
    expect(cashbackAppliesToSource(BOOKING_SOURCE.webhook)).toBe(false);
    expect(cashbackAppliesToSource('qualquer_outra')).toBe(false);
  });
});

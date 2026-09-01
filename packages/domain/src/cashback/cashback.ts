import { applyPercent, cents, type Cents } from '../money/cents.js';

/**
 * Núcleo de cashback (§5.8) — funções puras. Cashback é passivo: dinheiro que a empresa
 * deve ao cliente. A regra vigente é resolvida a partir da config da empresa e do
 * override do grupo, e o crédito é calculado sobre a base configurada. Congelar a regra
 * na inscrição (CB-09) e a imutabilidade do ledger é o que impede recálculo do passado.
 */

export type CashbackMode = 'percent' | 'fixed';
export type CashbackBase = 'paid' | 'contracted';

/** Configuração da empresa (§5.8). Nasce zerada e desligada. */
export interface CashbackConfig {
  readonly enabled: boolean;
  readonly mode: CashbackMode;
  readonly value: number; // percentual (ex.: 5) ou centavos (fixo)
  readonly base: CashbackBase;
  readonly releaseDays: number;
  readonly validityMonths: number;
  readonly maxRedemptionPct: number;
}

/** Regra resolvida e congelável na inscrição. */
export interface CashbackRule {
  readonly mode: CashbackMode;
  readonly value: number;
  readonly base: CashbackBase;
  readonly releaseDays: number;
  readonly validityMonths: number;
  readonly maxRedemptionPct: number;
}

/** Override por grupo — três estados (CB-02). `custom` é campanha e vale mesmo com o módulo desligado. */
export type CashbackOverride =
  | { readonly kind: 'inherit' }
  | { readonly kind: 'off' }
  | { readonly kind: 'custom'; readonly rule: CashbackRule };

/**
 * Origem da inscrição (§5.5/§5.7). Só a **auto-inscrição do cliente pelo app** (`portal`)
 * gera cashback — é um benefício de fidelidade para quem já é cliente e se inscreve
 * sozinho, sem custo de marketing. Inscrição criada pela equipe (`manual`, inclusive o
 * pacote de preço manual) ou vinda do formulário externo (`webhook`) não gera crédito.
 */
export const BOOKING_SOURCE = {
  portal: 'portal',
  manual: 'manual',
  webhook: 'webhook',
} as const;

export type BookingSource = (typeof BOOKING_SOURCE)[keyof typeof BOOKING_SOURCE];

/** §5.8: o cashback só se aplica à inscrição que o próprio cliente fez pelo app. */
export function cashbackAppliesToSource(source: string): boolean {
  return source === BOOKING_SOURCE.portal;
}

/** CB-02: resolve a regra vigente. `null` = esta inscrição não gera crédito. */
export function resolveCashbackRule(
  config: CashbackConfig,
  override: CashbackOverride,
): CashbackRule | null {
  if (override.kind === 'off') return null;
  if (override.kind === 'custom') return override.rule;
  // inherit
  if (!config.enabled) return null;
  return {
    mode: config.mode,
    value: config.value,
    base: config.base,
    releaseDays: config.releaseDays,
    validityMonths: config.validityMonths,
    maxRedemptionPct: config.maxRedemptionPct,
  };
}

/** CB-01: crédito sobre a base (percentual) ou valor fixo (ignora a base). */
export function calculateCashback(
  baseCents: Cents,
  rule: Pick<CashbackRule, 'mode' | 'value'>,
): Cents {
  if (rule.mode === 'fixed') return cents(Math.max(0, Math.trunc(rule.value)));
  return applyPercent(baseCents, rule.value);
}

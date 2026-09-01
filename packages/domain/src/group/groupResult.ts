import { subCents, type Cents } from '../money/cents.js';

/**
 * Resultado financeiro do grupo (§3.6, GR-10): receita − gastos = margem bruta, com
 * o percentual sobre a receita. Função pura; a margem pode ser negativa (gasto maior
 * que receita). O percentual é métrica de exibição (uma casa decimal), não dinheiro —
 * nulo quando a receita é zero, para não dividir por zero.
 */

export interface GroupResult {
  readonly revenueCents: Cents;
  readonly expenseCents: Cents;
  readonly grossMarginCents: Cents;
  readonly marginPercent: number | null;
}

export function computeGroupResult(revenueCents: Cents, expenseCents: Cents): GroupResult {
  const grossMarginCents = subCents(revenueCents, expenseCents);
  const marginPercent =
    revenueCents === 0 ? null : Math.round((grossMarginCents / revenueCents) * 1000) / 10;
  return { revenueCents, expenseCents, grossMarginCents, marginPercent };
}

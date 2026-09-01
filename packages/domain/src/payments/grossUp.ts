import { cents, type Cents } from '../money/cents.js';

/**
 * PG-04 — a cobrança parte do **líquido**: o valor que precisa sobrar para a empresa
 * depois das taxas do provedor. O cliente paga o bruto.
 *
 * São **duas taxas com bases diferentes**, e é isso que impede uma soma simples:
 *
 * 1. a **transação** incide sobre o valor cobrado (o bruto);
 * 2. a **antecipação** incide sobre o que sobra depois da transação — é esse valor que o
 *    provedor antecipa.
 *
 * ```
 * líquido = (bruto × (1 − transação) − fixa) × (1 − antecipação)
 *
 *           líquido / (1 − antecipação) + fixa
 * bruto  =  ─────────────────────────────────
 *                   1 − transação
 * ```
 *
 * Arredondamento **para cima**: sobrar um centavo a mais é irrelevante; a menos significa
 * receber menos do que a inscrição vale, e é o valor da inscrição que tem de fechar.
 *
 * Percentuais em **basis points** (1% = 100 bps) — inteiros, pelo mesmo motivo que
 * dinheiro é centavo: 2,99 em float não é 2,99.
 */

/**
 * O que o tenant configura por forma de pagamento. A taxa da **transação** não está aqui:
 * é perguntada ao provedor a cada cobrança (PG-05), que sabe a faixa de parcelas do plano
 * contratado. Aqui fica só o que o provedor não informa por API.
 */
export interface FeeRate {
  /**
   * Custo de antecipar, **ao mês**. Só existe onde há prazo até o dinheiro cair: no
   * cartão. Pix cai na hora e boleto em D+1 — não há o que antecipar.
   */
  readonly anticipationMonthlyBps?: number | undefined;
  /**
   * Dias entre uma parcela e a seguinte na liberação **sem antecipar**. No ASAAS são 32,
   * não 30 — e a diferença aparece: em 6x são 3,73 meses de prazo médio em vez de 3,5.
   */
  readonly settlementCycleDays?: number | undefined;
}

export interface FeeSettings {
  readonly pix?: FeeRate | undefined;
  readonly boleto?: FeeRate | undefined;
  readonly card?: FeeRate | undefined;
}

/** O que o provedor cobra pela transação — a resposta da simulação. */
export interface ProviderQuote {
  readonly percentBps: number;
  readonly fixedCents: Cents;
}

/** As duas taxas desta cobrança, cada uma com a sua base. */
export interface EffectiveFee {
  /** Sobre o bruto. */
  readonly transactionBps: number;
  readonly fixedCents: Cents;
  /** Sobre o que sobra depois da transação. */
  readonly anticipationBps: number;
}

/** Ciclo padrão do ASAAS entre parcelas liberadas sem antecipação. */
export const DEFAULT_SETTLEMENT_CYCLE_DAYS = 32;

const MONTH_DAYS = 30;

/** Taxa que consome tudo não tem solução: nenhum bruto deixaria o líquido pedido. */
export class ImpossibleFeeError extends Error {
  constructor(totalBps: number) {
    super(`Taxa de ${(totalBps / 100).toFixed(2)}% não deixa nada para a empresa`);
    this.name = 'ImpossibleFeeError';
  }
}

export function grossUpAmount(netCents: Cents, fee: EffectiveFee): Cents {
  if (fee.transactionBps >= 10_000 || fee.anticipationBps >= 10_000) {
    throw new ImpossibleFeeError(Math.max(fee.transactionBps, fee.anticipationBps));
  }
  const beforeAnticipation = (netCents * 10_000) / (10_000 - fee.anticipationBps);
  const gross = Math.ceil(
    ((beforeAnticipation + fee.fixedCents) * 10_000) / (10_000 - fee.transactionBps),
  );
  return cents(gross);
}

/**
 * PG-09 — o caminho inverso: dado o que o cliente pagou, quanto entra na conta.
 *
 * Serve para o **lançamento manual**, que também passa pelo provedor: um pix de R$ 100
 * deixa R$ 99,01 quando a taxa fixa é R$ 0,99. As bases são as mesmas do gross-up — a
 * transação incide sobre o pago, a antecipação sobre o que sobra dela.
 *
 * Piso em zero: taxa maior que o valor recebido não vira dívida da inscrição.
 */
export function netOfFee(paidCents: Cents, fee: EffectiveFee): Cents {
  const afterTransaction =
    paidCents - Math.round((paidCents * fee.transactionBps) / 10_000) - fee.fixedCents;
  if (afterTransaction <= 0) return cents(0);
  const net = afterTransaction - Math.round((afterTransaction * fee.anticipationBps) / 10_000);
  return cents(Math.max(0, net));
}

/**
 * As taxas desta cobrança. A transação vem do provedor; a antecipação é juros ao mês por
 * parcela, proporcional ao prazo de cada uma.
 *
 * Em `n` parcelas, cada uma vale `total/n` e é liberada a cada ciclo (32 dias no ASAAS):
 * o custo sobre o total é `taxa × (ciclo/30) × (1+2+…+n)/n = taxa × (ciclo/30) × (n+1)/2`.
 * Multiplicar por `n` só valeria se o dinheiro inteiro esperasse n meses — mas só a
 * última parcela espera isso.
 *
 * Pix e boleto não antecipam: o dinheiro já está lá.
 */
export function effectiveFee(
  quote: ProviderQuote,
  settings: FeeSettings,
  billingType: string,
  installments: number,
): EffectiveFee {
  const base = { transactionBps: quote.percentBps, fixedCents: quote.fixedCents };
  if (billingType !== 'CREDIT_CARD') {
    return { ...base, anticipationBps: 0 };
  }

  const card = settings.card;
  const monthly = card?.anticipationMonthlyBps ?? 0;
  const cycleDays = card?.settlementCycleDays ?? DEFAULT_SETTLEMENT_CYCLE_DAYS;
  const parcels = Math.max(1, installments);
  const averageMonths = ((parcels + 1) / 2) * (cycleDays / MONTH_DAYS);

  return { ...base, anticipationBps: Math.round(monthly * averageMonths) };
}

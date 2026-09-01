import type { LocalDate } from '@expedition/domain';
import type { PaymentEnvironment } from './paymentIntegrationRepository.js';

/**
 * PG-01 — port **de saída** para o provedor de pagamento. A aplicação define o que
 * precisa; a infraestrutura fala HTTP com o ASAAS. Assim o caso de uso é testável sem
 * rede, e trocar de provedor um dia não mexe em regra.
 */

export interface GatewayCredentials {
  readonly accessToken: string;
  readonly environment: PaymentEnvironment;
}

export interface GatewayAccount {
  readonly name: string;
}

export interface GatewayCustomerInput {
  readonly name: string;
  readonly cpf: string;
  readonly email: string | null;
  readonly phone: string | null;
}

export interface GatewayChargeInput {
  readonly customer: GatewayCustomerInput;
  readonly amountCents: number;
  readonly billingType: string;
  /** Parcelas no cartão. 1 = à vista. */
  readonly installments: number;
  readonly dueDate: LocalDate;
  readonly description: string;
  /** Id da inscrição, para reconhecer a cobrança no painel do provedor. */
  readonly externalReference: string;
}

export interface GatewayCharge {
  readonly externalId: string;
  /** PG-03: id do parcelamento, quando a venda é parcelada. */
  readonly installmentExternalId: string | null;
  readonly invoiceUrl: string | null;
  readonly status: string;
}

/** PG-05: o que o provedor cobra por esta venda, perguntado a ele. */
export interface GatewayQuote {
  /** Taxa da transação em basis points, já na faixa certa de parcelas. */
  readonly percentBps: number;
  /** Taxa fixa por transação, em centavos. */
  readonly fixedCents: number;
}

export interface GatewaySimulation {
  readonly valueCents: number;
  readonly billingType: string;
  readonly installments: number;
}

/**
 * PG-07 — o que **de fato** aconteceu com uma cobrança no provedor.
 *
 * Pago pelo cliente e creditado na conta são **coisas diferentes**, e é a distinção que
 * dá sentido à conciliação: o cartão aprovado hoje (`CONFIRMED`) só vira dinheiro na data
 * de crédito — D+30, ou dois dias úteis se antecipado. Contar aprovação como recebimento
 * é dizer que entrou dinheiro que não entrou.
 */
export interface GatewaySettlement {
  /** O que o cliente pagou: aprovado **e** creditado. */
  readonly paidCents: number;
  /** Líquido que já caiu na conta, depois das taxas e da antecipação. */
  readonly creditedCents: number;
  /** Líquido aprovado que ainda não caiu. */
  readonly awaitingCreditCents: number;
  readonly paidInstallments: number;
  readonly creditedInstallments: number;
  readonly totalInstallments: number;
  /** Quanto a antecipação custou, quando houve. */
  readonly anticipationFeeCents: number;
  /** Quando o provedor espera creditar o próximo valor. */
  readonly nextCreditDate: LocalDate | null;
  /**
   * Id do parcelamento visto no provedor. Cobrança emitida antes de guardarmos este id
   * se conserta sozinha na primeira conciliação.
   */
  readonly installmentExternalId: string | null;
}

export interface SettlementRef {
  readonly externalId: string;
  readonly installmentExternalId: string | null;
}

export interface PaymentGateway {
  /**
   * Valida a credencial e devolve a conta. `null` = chave recusada — conectar sem checar
   * guardaria uma chave morta que só falharia na primeira cobrança de verdade.
   */
  checkAccount(credentials: GatewayCredentials): Promise<GatewayAccount | null>;
  createCharge(credentials: GatewayCredentials, input: GatewayChargeInput): Promise<GatewayCharge>;
  /**
   * PG-05 — pergunta ao provedor quanto ele cobra por esta venda. É melhor do que
   * reproduzir a tabela de preços: o plano tem faixas por número de parcelas, muda com
   * o tempo e é negociado por conta. Quem sabe a taxa é quem cobra.
   */
  simulate(
    credentials: GatewayCredentials,
    simulation: GatewaySimulation,
  ): Promise<GatewayQuote | null>;
  /** PG-07: o realizado desta cobrança no provedor — para conciliar. */
  fetchSettlement(
    credentials: GatewayCredentials,
    ref: SettlementRef,
  ): Promise<GatewaySettlement | null>;
}

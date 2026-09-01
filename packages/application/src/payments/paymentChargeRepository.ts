import type { Cents, LocalDate } from '@expedition/domain';
import type { AsaasChargeStatus } from '@expedition/domain';
import type { PaymentEnvironment } from './paymentIntegrationRepository.js';

/**
 * PG-02 — port das cobranças emitidas. Uma cobrança é a ponte entre a inscrição daqui e
 * o pagamento lá: o webhook chega com o id do provedor e é por ele que a linha é achada.
 *
 * `bookingPaymentId` preenchido é a marca de "já lançado no ledger" — é o que faz o
 * reenvio do provedor ser inofensivo, sem depender de deduplicar por evento.
 */

export interface PaymentChargeRecord {
  readonly id: string;
  readonly bookingId: string;
  readonly provider: string;
  readonly environment: PaymentEnvironment;
  readonly externalId: string;
  /** PG-03: id do parcelamento, quando parcelada. */
  readonly installmentExternalId: string | null;
  /** O que o cliente paga. */
  readonly amountCents: Cents;
  /** PG-04: o que deve sobrar depois das taxas do provedor. */
  readonly netAmountCents: Cents;
  readonly installments: number;
  readonly billingType: string;
  readonly dueDate: LocalDate;
  readonly status: AsaasChargeStatus;
  readonly invoiceUrl: string | null;
  readonly bookingPaymentId: string | null;
  readonly paidAt: Date | null;
  readonly createdAt: Date;
  /** PG-07: o realizado, lido do provedor. Null = ainda não conciliada. */
  /** O que o cliente pagou: aprovado e creditado. */
  readonly settledGrossCents: number | null;
  /** O que já caiu na conta. */
  readonly settledNetCents: number | null;
  /** Aprovado que ainda não caiu. */
  readonly awaitingCreditCents: number | null;
  readonly anticipationFeeCents: number | null;
  readonly paidInstallments: number | null;
  readonly creditedInstallments: number | null;
  readonly nextCreditDate: LocalDate | null;
  readonly reconciledAt: Date | null;
}

/** PG-07: o que a conciliação grava. */
export interface ChargeSettlement {
  readonly settledGrossCents: number;
  readonly settledNetCents: number;
  readonly awaitingCreditCents: number;
  readonly anticipationFeeCents: number;
  readonly paidInstallments: number;
  readonly creditedInstallments: number;
  readonly nextCreditDate: LocalDate | null;
  readonly reconciledAt: Date;
  /** PG-07: conserta a cobrança antiga que não guardou o id do parcelamento. */
  readonly installmentExternalId?: string | null | undefined;
}

export interface NewPaymentCharge {
  readonly tenantId: string;
  readonly bookingId: string;
  readonly provider: string;
  readonly environment: PaymentEnvironment;
  readonly externalId: string;
  readonly installmentExternalId: string | null;
  readonly amountCents: Cents;
  readonly netAmountCents: Cents;
  readonly installments: number;
  readonly billingType: string;
  readonly dueDate: LocalDate;
  readonly status: AsaasChargeStatus;
  readonly invoiceUrl: string | null;
  readonly createdBy: string | null;
}

export interface PaymentChargeRepository {
  create(charge: NewPaymentCharge): Promise<PaymentChargeRecord>;
  /**
   * PG-03: acha a cobrança por qualquer id que o provedor mande — o da cobrança à vista
   * ou o do parcelamento, que é o que vem em cada parcela.
   */
  findByExternalId(
    tenantId: string,
    provider: string,
    externalId: string,
    installmentExternalId?: string | null,
  ): Promise<PaymentChargeRecord | null>;
  findById(tenantId: string, chargeId: string): Promise<PaymentChargeRecord | null>;
  /** PG-07: guarda o realizado ao lado do esperado. */
  saveSettlement(
    tenantId: string,
    chargeId: string,
    settlement: ChargeSettlement,
  ): Promise<PaymentChargeRecord>;
  listByBooking(tenantId: string, bookingId: string): Promise<PaymentChargeRecord[]>;
  /** GR-13: as cobranças de um grupo inteiro, para somar as taxas na mesa. */
  listByBookings(tenantId: string, bookingIds: readonly string[]): Promise<PaymentChargeRecord[]>;
  /** PG-06: últimas cobranças do tenant, mais recentes primeiro — o financeiro da empresa. */
  listRecent(tenantId: string, limit: number): Promise<PaymentChargeRecord[]>;
  /** PG-03: liga a cobrança ao recebimento que ela gerou. */
  markSettled(
    tenantId: string,
    chargeId: string,
    bookingPaymentId: string,
    paidAt: Date,
  ): Promise<PaymentChargeRecord>;
  setStatus(
    tenantId: string,
    chargeId: string,
    status: AsaasChargeStatus,
  ): Promise<PaymentChargeRecord>;
}

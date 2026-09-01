import type { Cents, LocalDate } from '@expedition/domain';

/**
 * Port de recebimentos (§3.6, GR-05). Histórico imutável: o recebido de uma inscrição
 * é a SOMA desta tabela, nunca coluna. O primeiro recebimento confirma a inscrição na
 * MESMA transação (IN-08), por isso `create` aceita a confirmação a aplicar no booking.
 */

/**
 * Natureza do lançamento (§3.6): entrada de dinheiro, devolução em dinheiro ou
 * conversão em crédito do cliente. Devolução e conversão entram com valor **negativo**,
 * então toda soma de "recebido" já sai líquida.
 */
export type PaymentKind = 'payment' | 'refund' | 'cashback';

export interface NewPayment {
  readonly tenantId: string;
  readonly bookingId: string;
  readonly paidAt: LocalDate;
  /** PG-08: o que **quita** a inscrição. Com taxa repassada, é o líquido que a empresa recebe. */
  readonly amountCents: Cents;
  /** PG-08: o que o cliente pagou, quando difere do que quita. */
  readonly customerPaidCents?: Cents | undefined;
  /** PG-08: cobrança que originou este recebimento. */
  readonly chargeId?: string | null | undefined;
  readonly kind?: PaymentKind | undefined;
  readonly method: string; // pix|boleto|card|cash
  readonly reference: string | null;
  readonly notes: string | null;
  readonly createdBy: string | null;
}

export interface PaymentRecord {
  readonly id: string;
  readonly bookingId: string;
  readonly paidAt: LocalDate;
  readonly amountCents: Cents;
  readonly customerPaidCents: number | null;
  readonly chargeId: string | null;
  readonly kind: PaymentKind;
  readonly method: string;
  readonly reference: string | null;
  readonly notes: string | null;
}

/**
 * Confirmação a gravar no booking quando este é o primeiro recebimento (IN-08).
 * `confirmedBy` é null quando quem confirmou foi o gateway (PG-03): não há usuário por
 * trás, e o registro de quem/como fica na trilha, com o id da cobrança.
 */
export interface BookingConfirmation {
  readonly confirmedBy: string | null;
  readonly confirmedAt: Date;
}

export interface PaymentRepository {
  /**
   * IN-08: cria o recebimento e, quando `confirmation` vem preenchida, muda a inscrição
   * de `pending` para `confirmed` na mesma transação (só se ainda estiver pending).
   */
  create(payment: NewPayment, confirmation: BookingConfirmation | null): Promise<PaymentRecord>;
  listByBooking(tenantId: string, bookingId: string): Promise<PaymentRecord[]>;
  /** Recebimentos de todas as inscrições do grupo — para o "recebido" da Tabela 1. */
  listByGroup(tenantId: string, groupId: string): Promise<PaymentRecord[]>;
  findById(tenantId: string, paymentId: string): Promise<PaymentRecord | null>;
  /** IN-11: exclusão lógica (dinheiro não some do ledger; `deleted_at`). */
  softDelete(tenantId: string, paymentId: string): Promise<void>;
  /** IN-11: quantos recebimentos ativos restam na inscrição (para o alerta). */
  countActiveByBooking(tenantId: string, bookingId: string): Promise<number>;
}

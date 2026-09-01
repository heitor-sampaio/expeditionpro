import type { CashbackRule, Cents, LocalDate, PriceCategory } from '@expedition/domain';

/**
 * CB-09: a regra de cashback vigente **congelada na inscrição**. `rule: null` = nenhuma
 * regra valia na alocação (módulo/override off) — e continua não valendo, mesmo que a
 * config mude depois. Ausente no `BookingRecord` = inscrição antiga, sem congelamento
 * (o accrual resolve ao vivo, retrocompatível).
 */
export interface CashbackSnapshot {
  readonly rule: CashbackRule | null;
}

/**
 * Port de inscrições (§5.5 / §5.7). Uma inscrição é uma família num grupo; nasce
 * `pending` (IN-07) e congela, por participante, a categoria e o valor unitário
 * resolvidos na alocação (§3.4). O total **não** é coluna: é a soma dos unitários.
 */

export interface NewBookingParticipant {
  readonly customerId: string;
  readonly priceCategory: PriceCategory;
  readonly unitPriceCents: Cents;
  readonly priceSource: string; // auto | override
  readonly priceNote: string | null;
}

/** Override de valor de um participante (GR-04). Motivo obrigatório em quem chama. */
export interface ParticipantPriceOverride {
  readonly customerId: string;
  readonly unitPriceCents: Cents;
  readonly priceNote: string;
}

/** GR-04: o preço de tabela recalculado para um participante, na volta do ajuste. */
export interface ParticipantTablePrice {
  readonly customerId: string;
  readonly unitPriceCents: Cents;
  readonly priceCategory: PriceCategory;
}

export interface NewBooking {
  readonly tenantId: string;
  readonly groupId: string;
  readonly responsibleCustomerId: string;
  readonly status: string; // pending
  readonly source: string; // manual | webhook | portal
  readonly participants: readonly NewBookingParticipant[];
  /** CB-09: regra de cashback congelada na alocação (opcional; `{ rule: null }` = sem regra). */
  readonly cashbackRuleSnapshot?: CashbackSnapshot | null;
}

export interface BookingParticipantRecord extends NewBookingParticipant {
  readonly id: string;
}

/**
 * CP-05: o cupom aplicado à inscrição, carregado junto do registro. Vem do resgate
 * ativo (§5.15) — nunca de coluna no `bookings`, e nunca distribuído entre os
 * participantes, cujo snapshot é imutável (§3.4). `null` = inscrição sem desconto.
 */
export interface BookingDiscount {
  readonly couponId: string;
  readonly code: string;
  readonly discountCents: Cents;
}

export interface BookingRecord {
  readonly id: string;
  readonly groupId: string;
  readonly responsibleCustomerId: string;
  readonly status: string;
  readonly source: string;
  readonly invoiceChecked: boolean; // GR-06: check de NF
  /** GR-14: quando a familia embarcou. Null = ainda nao fez check-in. */
  readonly checkedInAt: Date | null;
  readonly participants: readonly BookingParticipantRecord[];
  /** CB-09: regra congelada na alocação. Ausente = inscrição antiga (accrual resolve ao vivo). */
  readonly cashbackRuleSnapshot?: CashbackSnapshot | null;
  /** CP-05: desconto do cupom em vigor nesta inscrição. Ausente ou null = sem desconto. */
  readonly discount?: BookingDiscount | null;
}

/** Estado da NF de uma inscrição (GR-06). Datas nas bordas (Date/LocalDate). */
export interface BookingInvoice {
  readonly checked: boolean;
  readonly checkedBy: string | null;
  readonly checkedAt: Date | null;
  readonly invoiceNumber: string | null;
  readonly invoiceIssuedAt: LocalDate | null;
}

export interface BookingRepository {
  /** Cria a inscrição e seus participantes atomicamente (IN-18). */
  create(booking: NewBooking): Promise<BookingRecord>;
  /** IN-02: já existe inscrição do responsável neste grupo? (UNIQUE de negócio). */
  existsForResponsible(
    tenantId: string,
    groupId: string,
    responsibleCustomerId: string,
  ): Promise<boolean>;
  findById(tenantId: string, bookingId: string): Promise<BookingRecord | null>;
  /** GR-07: inscrições do grupo (não excluídas), com participantes — para a Tabela 1. */
  listByGroup(tenantId: string, groupId: string): Promise<BookingRecord[]>;
  /** CL-06: inscrições em que o cliente participa (responsável ou participante) — a ficha. */
  listByCustomer(tenantId: string, customerId: string): Promise<BookingRecord[]>;
  /** IN-17b: últimas inscrições do tenant, mais recentes primeiro. */
  listRecent(tenantId: string, limit: number): Promise<BookingRecord[]>;
  /** GR-14: marca (Date) ou desfaz (null) o check-in, guardando quem fez. */
  setCheckedIn(
    tenantId: string,
    bookingId: string,
    at: Date | null,
    by: string | null,
  ): Promise<BookingRecord>;
  /** GR-04: aplica overrides de valor por participante, atomicamente. */
  applyParticipantOverrides(
    tenantId: string,
    bookingId: string,
    overrides: readonly ParticipantPriceOverride[],
  ): Promise<BookingRecord>;
  /**
   * GR-04: devolve os participantes ao preço de tabela — origem `auto`, sem motivo.
   * Operação própria, e não um `applyParticipantOverrides` com outro argumento: aqui a
   * categoria também volta a ser a que a idade resolve, e o par origem/motivo é o
   * oposto do override. Um setter genérico esconderia que são movimentos contrários.
   */
  restoreParticipantTablePrices(
    tenantId: string,
    bookingId: string,
    prices: readonly ParticipantTablePrice[],
  ): Promise<BookingRecord>;
  /** IN-10: confirma sem pagamento (só se ainda `pending`), gravando quem/quando/nota. */
  confirmManually(
    tenantId: string,
    bookingId: string,
    confirmation: ManualConfirmation,
  ): Promise<BookingRecord>;
  /** IN-15/IN-16: cancela a inscrição (não toca nos recebimentos), gravando quem/quando/motivo. */
  cancel(
    tenantId: string,
    bookingId: string,
    cancellation: BookingCancellation,
  ): Promise<BookingRecord>;
  /** GR-06: marca/desmarca a NF, gravando quem/quando e número/data opcionais. */
  setInvoiceCheck(
    tenantId: string,
    bookingId: string,
    invoice: BookingInvoice,
  ): Promise<BookingInvoice>;
  /** AG-06: contagem de inscrições por grupo (confirmadas/pendentes) para a ocupação na agenda. */
  countByGroup(tenantId: string): Promise<GroupBookingCounts[]>;
}

/** AG-06: quantas inscrições confirmadas e pendentes cada grupo tem (canceladas fora). */
export interface GroupBookingCounts {
  readonly groupId: string;
  readonly confirmedCount: number;
  readonly pendingCount: number;
}

export interface ManualConfirmation {
  readonly confirmedBy: string;
  readonly confirmedAt: Date;
  readonly note: string;
}

export interface BookingCancellation {
  readonly cancelledBy: string;
  readonly cancelledAt: Date;
  readonly reason: string;
}

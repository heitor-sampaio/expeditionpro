import type {
  BookingCancellation,
  BookingInvoice,
  BookingRecord,
  BookingRepository,
  ManualConfirmation,
  NewBooking,
  ParticipantPriceOverride,
  ParticipantTablePrice,
} from './bookingRepository.js';

/** Fake in-memory do port de inscrições. Excluído do build (`*.fake.ts`). */
export function fakeBookingRepository(): BookingRepository & { rows: BookingRecord[] } {
  const rows: BookingRecord[] = [];
  let seq = 0;

  return {
    rows,
    create(booking: NewBooking) {
      seq += 1;
      const bookingId = `booking-${seq}`;
      const record: BookingRecord = {
        id: bookingId,
        groupId: booking.groupId,
        responsibleCustomerId: booking.responsibleCustomerId,
        status: booking.status,
        source: booking.source,
        invoiceChecked: false,
        checkedInAt: null,
        cashbackRuleSnapshot: booking.cashbackRuleSnapshot ?? null,
        participants: booking.participants.map((participant, index) => ({
          ...participant,
          id: `bp-${seq}-${index}`,
        })),
      };
      rows.push(record);
      return Promise.resolve(record);
    },
    setCheckedIn(tenantId: string, bookingId: string, at: Date | null, by: string | null) {
      void tenantId;
      void by;
      const index = rows.findIndex((r) => r.id === bookingId);
      if (index < 0) return Promise.reject(new Error('booking nao encontrado'));
      const updated = { ...rows[index]!, checkedInAt: at };
      rows[index] = updated;
      return Promise.resolve(updated);
    },
    existsForResponsible(tenantId: string, groupId: string, responsibleCustomerId: string) {
      void tenantId;
      return Promise.resolve(
        rows.some(
          (r) => r.groupId === groupId && r.responsibleCustomerId === responsibleCustomerId,
        ),
      );
    },
    findById(tenantId: string, bookingId: string) {
      void tenantId;
      return Promise.resolve(rows.find((r) => r.id === bookingId) ?? null);
    },
    listByGroup(tenantId: string, groupId: string) {
      void tenantId;
      return Promise.resolve(rows.filter((r) => r.groupId === groupId));
    },
    listRecent(tenantId: string, limit: number) {
      void tenantId;
      return Promise.resolve([...rows].reverse().slice(0, limit));
    },
    listByCustomer(tenantId: string, customerId: string) {
      void tenantId;
      return Promise.resolve(
        rows.filter(
          (r) =>
            r.responsibleCustomerId === customerId ||
            r.participants.some((p) => p.customerId === customerId),
        ),
      );
    },
    applyParticipantOverrides(
      tenantId: string,
      bookingId: string,
      overrides: readonly ParticipantPriceOverride[],
    ) {
      void tenantId;
      const index = rows.findIndex((r) => r.id === bookingId);
      if (index === -1) return Promise.reject(new Error('booking not found'));
      const byCustomer = new Map(overrides.map((o) => [o.customerId, o]));
      const current = rows[index]!;
      const updated: BookingRecord = {
        ...current,
        participants: current.participants.map((p) => {
          const override = byCustomer.get(p.customerId);
          return override
            ? {
                ...p,
                unitPriceCents: override.unitPriceCents,
                priceSource: 'override',
                priceNote: override.priceNote,
              }
            : p;
        }),
      };
      rows[index] = updated;
      return Promise.resolve(updated);
    },
    restoreParticipantTablePrices(
      tenantId: string,
      bookingId: string,
      prices: readonly ParticipantTablePrice[],
    ) {
      void tenantId;
      const index = rows.findIndex((r) => r.id === bookingId);
      if (index === -1) return Promise.reject(new Error('booking not found'));
      const byCustomer = new Map(prices.map((price) => [price.customerId, price]));
      const current = rows[index]!;
      const updated: BookingRecord = {
        ...current,
        participants: current.participants.map((p) => {
          const price = byCustomer.get(p.customerId);
          return price
            ? {
                ...p,
                unitPriceCents: price.unitPriceCents,
                priceCategory: price.priceCategory,
                priceSource: 'auto',
                priceNote: null,
              }
            : p;
        }),
      };
      rows[index] = updated;
      return Promise.resolve(updated);
    },

    confirmManually(tenantId: string, bookingId: string, confirmation: ManualConfirmation) {
      void tenantId;
      void confirmation;
      const index = rows.findIndex((r) => r.id === bookingId);
      if (index === -1) return Promise.reject(new Error('booking not found'));
      const updated: BookingRecord = { ...rows[index]!, status: 'confirmed' };
      rows[index] = updated;
      return Promise.resolve(updated);
    },
    cancel(tenantId: string, bookingId: string, cancellation: BookingCancellation) {
      void tenantId;
      void cancellation;
      const index = rows.findIndex((r) => r.id === bookingId);
      if (index === -1) return Promise.reject(new Error('booking not found'));
      const updated: BookingRecord = { ...rows[index]!, status: 'cancelled' };
      rows[index] = updated;
      return Promise.resolve(updated);
    },
    setInvoiceCheck(tenantId: string, bookingId: string, invoice: BookingInvoice) {
      void tenantId;
      const index = rows.findIndex((r) => r.id === bookingId);
      if (index === -1) return Promise.reject(new Error('booking not found'));
      rows[index] = { ...rows[index]!, invoiceChecked: invoice.checked };
      return Promise.resolve(invoice);
    },
    countByGroup(tenantId: string) {
      void tenantId;
      const byGroup = new Map<string, { confirmedCount: number; pendingCount: number }>();
      for (const r of rows) {
        const acc = byGroup.get(r.groupId) ?? { confirmedCount: 0, pendingCount: 0 };
        if (r.status === 'confirmed') acc.confirmedCount += 1;
        else if (r.status === 'pending') acc.pendingCount += 1;
        byGroup.set(r.groupId, acc);
      }
      return Promise.resolve([...byGroup].map(([groupId, c]) => ({ groupId, ...c })));
    },
  };
}

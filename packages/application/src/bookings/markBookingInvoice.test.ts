import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '@expedition/domain';
import { fakeBookingRepository } from './bookingRepository.fake.js';
import { markBookingInvoice } from './markBookingInvoice.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { BookingRecord } from './bookingRepository.js';

const FIXED = new Date('2026-08-24T12:00:00.000Z');
const admin: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

function seed() {
  const bookings = fakeBookingRepository();
  const booking: BookingRecord = {
    id: 'bk-1',
    groupId: 'g-1',
    responsibleCustomerId: 'resp',
    status: 'confirmed',
    source: 'manual',
    invoiceChecked: false,
    checkedInAt: null,
    participants: [],
  };
  bookings.rows.push(booking);
  return bookings;
}

describe('GR-06: check de NF com quem/quando e número/data opcionais', () => {
  it('marca a NF gravando quem e quando, com número e data', async () => {
    const bookings = seed();
    const inv = await markBookingInvoice({ bookings, clock: () => FIXED }, admin, {
      bookingId: 'bk-1',
      checked: true,
      invoiceNumber: 'NF-123',
      issuedAt: '2026-08-20',
    });
    expect(inv.checked).toBe(true);
    expect(inv.checkedBy).toBe('u1');
    expect(inv.checkedAt).toEqual(FIXED);
    expect(inv.invoiceNumber).toBe('NF-123');
    expect(inv.invoiceIssuedAt).toEqual(parseLocalDate('2026-08-20'));
    expect(bookings.rows[0]!.invoiceChecked).toBe(true);
  });

  it('marca sem número nem data (ambos opcionais)', async () => {
    const bookings = seed();
    const inv = await markBookingInvoice({ bookings, clock: () => FIXED }, admin, {
      bookingId: 'bk-1',
      checked: true,
    });
    expect(inv.checked).toBe(true);
    expect(inv.invoiceNumber).toBeNull();
    expect(inv.invoiceIssuedAt).toBeNull();
  });

  it('desmarca limpa os metadados', async () => {
    const bookings = seed();
    await markBookingInvoice({ bookings, clock: () => FIXED }, admin, {
      bookingId: 'bk-1',
      checked: true,
      invoiceNumber: 'NF-1',
    });
    const inv = await markBookingInvoice({ bookings, clock: () => FIXED }, admin, {
      bookingId: 'bk-1',
      checked: false,
    });
    expect(inv.checked).toBe(false);
    expect(inv.checkedBy).toBeNull();
    expect(inv.checkedAt).toBeNull();
    expect(inv.invoiceNumber).toBeNull();
    expect(bookings.rows[0]!.invoiceChecked).toBe(false);
  });

  it('cliente não mexe em NF (403)', async () => {
    const bookings = seed();
    await expect(
      markBookingInvoice(
        { bookings, clock: () => FIXED },
        { tenantId: 'tenant-a', actor: { kind: 'customer', customerId: 'c1', userId: 'u2' } },
        { bookingId: 'bk-1', checked: true },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('inscrição inexistente é recusada', async () => {
    const bookings = seed();
    await expect(
      markBookingInvoice({ bookings, clock: () => FIXED }, admin, {
        bookingId: 'nao-existe',
        checked: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

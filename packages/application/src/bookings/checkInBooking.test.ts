import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '@expedition/domain';
import { fakeBookingRepository } from './bookingRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import { checkInBooking } from './checkInBooking.js';
import { undoCheckIn } from './undoCheckIn.js';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import { parseCpf } from '@expedition/domain';
import type { RequestContext } from '../context.js';

/**
 * GR-14 — o check-in marca quem embarcou. Vale para as duas pontas: o cliente confirma
 * a presença da família pelo app, a equipe confirma na porta. Desfazer é da equipe.
 */

const NO_DIA = new Date('2026-11-10T09:00:00.000Z');
const ANTES = new Date('2026-11-01T09:00:00.000Z');

const equipe: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

async function seed(status = 'confirmed') {
  const bookings = fakeBookingRepository();
  const customers = fakeCustomerRepository();
  const schedule = fakeScheduleRepository();
  const audit = fakeAuditLogRepository();

  const head = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: null,
    fullName: 'Vanessa Santos',
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate('1990-03-04'),
    email: 'v@example.com',
    phone: '5548999990000',
    address: EMPTY_ADDRESS,
  });
  const filho = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: head.id,
    fullName: 'Bruno Santos',
    cpf: parseCpf('277.373.070-44'),
    birthDate: parseLocalDate('2016-07-10'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });

  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: 'tenant-a',
      itineraryId: 'itin-1',
      startDate: parseLocalDate('2026-11-10'),
      endDate: parseLocalDate('2026-11-14'),
      title: null,
      notes: null,
      status: 'scheduled',
    },
    {
      name: 'Coxilha Rica',
      status: 'open',
      capacityVehicles: null,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );

  const booking = await bookings.create({
    tenantId: 'tenant-a',
    groupId: group.id,
    responsibleCustomerId: head.id,
    status: 'pending',
    source: 'portal',
    participants: [],
  });
  bookings.rows[0] = { ...bookings.rows[0], status };

  const cliente: RequestContext = {
    tenantId: 'tenant-a',
    actor: { kind: 'customer', customerId: filho.id, userId: 'user-1' },
  };

  return { bookings, customers, schedule, audit, booking, cliente, head };
}

const deps = (s, clock) => ({
  bookings: s.bookings,
  customers: s.customers,
  schedule: s.schedule,
  audit: s.audit,
  clock: () => clock,
});

describe('GR-14: check-in da inscrição', () => {
  it('o cliente faz o check-in da família no dia da saída', async () => {
    const s = await seed();
    const result = await checkInBooking(deps(s, NO_DIA), s.cliente, { bookingId: s.booking.id });
    expect(result.checkedInAt).toEqual(NO_DIA);
    expect(s.bookings.rows[0].checkedInAt).toEqual(NO_DIA);
  });

  it('não deixa fazer antes do dia da saída', async () => {
    const s = await seed();
    await expect(
      checkInBooking(deps(s, ANTES), s.cliente, { bookingId: s.booking.id }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('o cliente não faz check-in de inscrição pendente; a equipe faz', async () => {
    const s = await seed('pending');
    await expect(
      checkInBooking(deps(s, NO_DIA), s.cliente, { bookingId: s.booking.id }),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    const outra = await seed('pending');
    const result = await checkInBooking(deps(outra, NO_DIA), equipe, {
      bookingId: outra.booking.id,
    });
    expect(result.checkedInAt).toEqual(NO_DIA);
  });

  it('cliente de outra família não faz check-in da inscrição alheia', async () => {
    const s = await seed();
    const outro = await s.customers.create({
      tenantId: 'tenant-a',
      responsibleId: null,
      fullName: 'De Fora',
      cpf: parseCpf('900.000.100-57'),
      birthDate: parseLocalDate('1985-01-01'),
      email: 'fora@example.com',
      phone: '5548999990001',
      address: EMPTY_ADDRESS,
    });
    const ctx: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', customerId: outro.id, userId: 'user-9' },
    };
    await expect(
      checkInBooking(deps(s, NO_DIA), ctx, { bookingId: s.booking.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('inscrição inexistente é 404', async () => {
    const s = await seed();
    await expect(
      checkInBooking(deps(s, NO_DIA), equipe, { bookingId: 'nao-existe' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('registra na trilha quem fez o check-in', async () => {
    const s = await seed();
    await checkInBooking(deps(s, NO_DIA), equipe, { bookingId: s.booking.id });
    const entry = s.audit.rows.at(-1);
    expect(entry?.action).toBe('booking.checkin');
    expect(entry?.entityId).toBe(s.booking.id);
  });
});

describe('GR-14: desfazer o check-in é da equipe', () => {
  it('a equipe desfaz e a inscrição volta a poder fazer check-in', async () => {
    const s = await seed();
    await checkInBooking(deps(s, NO_DIA), equipe, { bookingId: s.booking.id });
    const result = await undoCheckIn(deps(s, NO_DIA), equipe, { bookingId: s.booking.id });
    expect(result.checkedInAt).toBeNull();
    expect(s.audit.rows.at(-1)?.action).toBe('booking.checkin_undo');
  });

  it('o cliente não desfaz o próprio check-in', async () => {
    const s = await seed();
    await checkInBooking(deps(s, NO_DIA), s.cliente, { bookingId: s.booking.id });
    await expect(
      undoCheckIn(deps(s, NO_DIA), s.cliente, { bookingId: s.booking.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('desfazer o que não tem check-in é erro de regra, não silêncio', async () => {
    const s = await seed();
    await expect(
      undoCheckIn(deps(s, NO_DIA), equipe, { bookingId: s.booking.id }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

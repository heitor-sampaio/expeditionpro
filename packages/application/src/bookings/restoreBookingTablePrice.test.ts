import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeBookingRepository } from './bookingRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import { discountBookingTotal } from './discountBookingTotal.js';
import { fakePaymentRepository } from '../payments/paymentRepository.fake.js';
import { restoreBookingTablePrice } from './restoreBookingTablePrice.js';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

/**
 * GR-04 — o desfazer do desconto de balcão. O ajuste só abate, então sem isto um erro de
 * digitação não tem volta: a tela não sobe valor, e a inscrição fica valendo menos para
 * sempre.
 *
 * Restaurar **não** é subir o valor à vontade — é voltar ao preço que a tabela do roteiro
 * diz para esta saída, o mesmo número que a alocação congelou. A resolução é pela data de
 * início do grupo (§3.4), então reajuste posterior do roteiro não entra aqui: o resultado
 * é o mesmo que no dia da alocação.
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const PRICES = {
  coupleCents: cents(289000),
  soloCents: cents(180000),
  extraAdultCents: cents(120000),
  childMidCents: cents(69000),
  childYoungCents: cents(40000),
};

async function setup() {
  const bookings = fakeBookingRepository();
  const customers = fakeCustomerRepository();
  const schedule = fakeScheduleRepository();
  const itineraries = fakeItineraryRepository();
  const audit = fakeAuditLogRepository();
  const payments = fakePaymentRepository(bookings.rows);

  const itinerary = await itineraries.create(
    {
      tenantId: 'tenant-a',
      name: 'Coxilha Rica',
      slug: 'coxilha-rica',
      description: null,
      difficulty: null,
      status: 'active',
      kind: 'catalog',
      childYoungMaxAge: 5,
      childMidMaxAge: 10,
    },
    { validFrom: parseLocalDate('2020-01-01'), prices: PRICES },
  );

  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: 'tenant-a',
      itineraryId: itinerary.id,
      startDate: parseLocalDate('2026-10-10'),
      endDate: parseLocalDate('2026-10-12'),
      title: null,
    },
    {
      name: 'Coxilha Rica · 10/10/2026',
      status: 'open',
      capacityVehicles: null,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );

  const head = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: null,
    fullName: 'Vanessa Santos',
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate('1983-03-30'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });
  const kid = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: head.id,
    fullName: 'Enzo Santos',
    cpf: parseCpf('900.000.100-57'),
    birthDate: parseLocalDate('2018-08-02'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });

  const booking = await bookings.create({
    tenantId: 'tenant-a',
    groupId: group.id,
    responsibleCustomerId: head.id,
    status: 'pending',
    source: 'manual',
    participants: [
      {
        customerId: head.id,
        priceCategory: 'SOLO',
        unitPriceCents: cents(180000),
        priceSource: 'auto',
        priceNote: null,
      },
      {
        customerId: kid.id,
        priceCategory: 'CHILD_MID',
        unitPriceCents: cents(69000),
        priceSource: 'auto',
        priceNote: null,
      },
    ],
  });

  const deps = { bookings, customers, schedule, itineraries, audit };
  return { ...deps, payments, booking, deps };
}

async function comDesconto(s: Awaited<ReturnType<typeof setup>>) {
  return discountBookingTotal({ bookings: s.bookings, payments: s.payments, audit: s.audit }, ctx, {
    bookingId: s.booking.id,
    reason: 'errei o número',
    mode: 'percent',
    value: 10,
  });
}

describe('GR-04: restaurar o preço de tabela', () => {
  it('devolve a inscrição ao valor que a tabela diz para a saída', async () => {
    const s = await setup();
    const descontada = await comDesconto(s);
    expect(Number(descontada.totalCents)).toBe(224100);

    const restaurada = await restoreBookingTablePrice(s.deps, ctx, { bookingId: s.booking.id });

    expect(Number(restaurada.totalCents)).toBe(249000);
  });

  it('a origem do preço volta a ser auto e o motivo do ajuste some', async () => {
    const s = await setup();
    await comDesconto(s);

    const restaurada = await restoreBookingTablePrice(s.deps, ctx, { bookingId: s.booking.id });

    for (const participant of restaurada.booking.participants) {
      expect(participant.priceSource).toBe('auto');
      expect(participant.priceNote).toBeNull();
    }
  });

  it('recategoriza pela idade na data de início, como a alocação faz', async () => {
    const s = await setup();
    await comDesconto(s);

    const restaurada = await restoreBookingTablePrice(s.deps, ctx, { bookingId: s.booking.id });

    expect(restaurada.booking.participants.map((p) => p.priceCategory)).toEqual([
      'SOLO',
      'CHILD_MID',
    ]);
  });

  it('inscrição sem ajuste nenhum não tem o que restaurar', async () => {
    const s = await setup();

    await expect(
      restoreBookingTablePrice(s.deps, ctx, { bookingId: s.booking.id }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('inscrição cancelada não é reprecificada', async () => {
    const s = await setup();
    await comDesconto(s);
    s.bookings.rows[0] = { ...s.bookings.rows[0]!, status: 'cancelled' };

    await expect(
      restoreBookingTablePrice(s.deps, ctx, { bookingId: s.booking.id }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('inscrição inexistente', async () => {
    const s = await setup();

    await expect(
      restoreBookingTablePrice(s.deps, ctx, { bookingId: 'nao-existe' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('GR-04: quem restaura, e o rastro', () => {
  it('operator não restaura — é a volta de uma decisão comercial', async () => {
    const s = await setup();
    await comDesconto(s);

    await expect(
      restoreBookingTablePrice(
        s.deps,
        { ...ctx, actor: { kind: 'team', userId: 'u2', role: 'operator' } },
        { bookingId: s.booking.id },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a trilha registra de quanto para quanto', async () => {
    const s = await setup();
    await comDesconto(s);

    await restoreBookingTablePrice(s.deps, ctx, { bookingId: s.booking.id });

    const entry = s.audit.rows.find((row) => row.action === 'booking.price_restore');
    expect(entry).toMatchObject({ entity: 'booking', entityId: s.booking.id, actorUserId: 'u1' });
    expect(entry?.diff).toMatchObject({ fromCents: 224100, toCents: 249000 });
  });
});

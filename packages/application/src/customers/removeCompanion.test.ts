import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate, type PriceCategory } from '@expedition/domain';
import { fakeCustomerRepository } from './customerRepository.fake.js';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakeCashbackRepository } from '../cashback/cashbackRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { removeCompanion } from './removeCompanion.js';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import { EMPTY_ADDRESS } from './customerRepository.js';
import type { RequestContext } from '../context.js';
import type { BookingRecord } from '../bookings/bookingRepository.js';

/**
 * CL-03/CL-06 — remover um acompanhante cadastrado por engano. Só isso: quem já viajou
 * tem histórico, e histórico é imutável (o RESTRICT das FKs de participante e cashback é
 * o backstop no banco; aqui a recusa vem antes, com um motivo legível).
 */

const admin: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
const operator: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u2', role: 'operator' },
};

async function seed() {
  const customers = fakeCustomerRepository();
  const bookings = fakeBookingRepository();
  const cashback = fakeCashbackRepository();
  const audit = fakeAuditLogRepository();

  const head = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: null,
    fullName: 'Ana Prado',
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate('1988-03-04'),
    email: 'ana@example.com',
    phone: '5548999990000',
    address: EMPTY_ADDRESS,
  });
  const companion = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: head.id,
    fullName: 'Bruno Prado',
    cpf: parseCpf('277.373.070-44'),
    birthDate: parseLocalDate('2015-07-10'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });
  return { customers, bookings, cashback, audit, head, companion };
}

function pushBooking(
  bookings: ReturnType<typeof fakeBookingRepository>,
  responsibleId: string,
  participantId: string,
) {
  const record: BookingRecord = {
    id: 'bk-1',
    groupId: 'grp-1',
    responsibleCustomerId: responsibleId,
    status: 'confirmed',
    source: 'manual',
    invoiceChecked: false,
    participants: [
      {
        id: 'bk-1-p0',
        customerId: participantId,
        priceCategory: 'CHILD_YOUNG' as PriceCategory,
        unitPriceCents: cents(40000),
        priceSource: 'auto',
        priceNote: null,
      },
    ],
  };
  bookings.rows.push(record);
}

describe('CL-03: remover acompanhante', () => {
  it('remove quem não tem histórico e registra na auditoria', async () => {
    const { customers, bookings, cashback, audit, head, companion } = await seed();

    await removeCompanion({ customers, bookings, cashback, audit }, admin, {
      customerId: companion.id,
    });

    expect(await customers.findById('tenant-a', companion.id)).toBeNull();
    expect(await customers.listByResponsible('tenant-a', head.id)).toEqual([]);
    const entry = audit.rows[0]!;
    expect(entry.action).toBe('customer.remove');
    expect(entry.entityId).toBe(companion.id);
    expect(entry.diff).toEqual({ from: head.id });
  });

  it('recusa quem já participou de uma inscrição — histórico é imutável', async () => {
    const { customers, bookings, cashback, audit, head, companion } = await seed();
    pushBooking(bookings, head.id, companion.id);

    await expect(
      removeCompanion({ customers, bookings, cashback, audit }, admin, {
        customerId: companion.id,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(await customers.findById('tenant-a', companion.id)).not.toBeNull();
    expect(audit.rows).toHaveLength(0);
  });

  it('recusa quem tem lançamento de cashback', async () => {
    const { customers, bookings, cashback, audit, companion } = await seed();
    await cashback.addEntry({
      tenantId: 'tenant-a',
      customerId: companion.id,
      bookingId: 'bk-9',
      type: 'accrual',
      amountCents: cents(5000),
      availableFrom: null,
      expiresAt: null,
      notes: null,
    });

    await expect(
      removeCompanion({ customers, bookings, cashback, audit }, admin, {
        customerId: companion.id,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('recusa remover um responsável — para isso existem vínculo e merge', async () => {
    const { customers, bookings, cashback, audit, head } = await seed();
    await expect(
      removeCompanion({ customers, bookings, cashback, audit }, admin, { customerId: head.id }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('exige owner/admin e recusa o cliente do portal', async () => {
    const { customers, bookings, cashback, audit, head, companion } = await seed();

    await expect(
      removeCompanion({ customers, bookings, cashback, audit }, operator, {
        customerId: companion.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const customerCtx: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', customerId: head.id, userId: 'cust-1' },
    };
    await expect(
      removeCompanion({ customers, bookings, cashback, audit }, customerCtx, {
        customerId: companion.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente inexistente é recusado', async () => {
    const { customers, bookings, cashback, audit } = await seed();
    await expect(
      removeCompanion({ customers, bookings, cashback, audit }, admin, {
        customerId: 'nao-existe',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

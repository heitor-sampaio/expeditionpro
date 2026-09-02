import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate } from '@expedition/domain';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import { fakeBookingRepository } from './bookingRepository.fake.js';
import { fakePaymentRepository } from '../payments/paymentRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { discountBookingTotal } from './discountBookingTotal.js';
import { getGroupBoard } from './getGroupBoard.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeVehicleRepository } from '../vehicles/vehicleRepository.fake.js';
import { BusinessRuleError, ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';

/**
 * GR-04 — o desconto de balcão. A equipe negocia sobre o **total** ("dou 10% para essa
 * família"), e o sistema resolve o resto: rateia entre os participantes, grava o motivo
 * em cada linha e re-deriva o contratado.
 *
 * Não confundir com o cupom (CP-05), que é campanha resgatada pelo cliente e entra como
 * resgate sem tocar no snapshot. Aqui é a casa refazendo o preço daquela inscrição.
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

function seed(status = 'pending') {
  const bookings = fakeBookingRepository();
  bookings.rows.push({
    id: 'bk-1',
    groupId: 'g-1',
    responsibleCustomerId: 'resp',
    status,
    source: 'manual',
    invoiceChecked: false,
    checkedInAt: null,
    participants: [
      {
        id: 'p1',
        customerId: 'resp',
        priceCategory: 'COUPLE',
        unitPriceCents: cents(289000),
        priceSource: 'auto',
        priceNote: null,
      },
      {
        id: 'p2',
        customerId: 'kid',
        priceCategory: 'CHILD_MID',
        unitPriceCents: cents(69000),
        priceSource: 'auto',
        priceNote: null,
      },
    ],
  });
  const payments = fakePaymentRepository(bookings.rows);
  const audit = fakeAuditLogRepository();
  return { bookings, payments, audit, deps: { bookings, payments, audit } };
}

/** Cliente mínimo para a mesa resolver o nome do participante. */
function pessoa(id: string, fullName: string) {
  return {
    id,
    tenantId: 'tenant-a',
    responsibleId: null,
    fullName,
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate('1990-01-01'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  };
}

async function boardOf(s: ReturnType<typeof seed>) {
  const schedule = fakeScheduleRepository();
  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: 'tenant-a',
      itineraryId: 'it-1',
      startDate: { year: 2026, month: 10, day: 10 },
      endDate: { year: 2026, month: 10, day: 12 },
      title: null,
      notes: null,
      status: 'scheduled',
    },
    {
      name: 'g',
      status: 'open',
      capacityVehicles: null,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );
  s.bookings.rows[0] = { ...s.bookings.rows[0]!, groupId: group.id };
  const customers = fakeCustomerRepository();
  customers.rows.push(pessoa('resp', 'Vanessa Santos'), pessoa('kid', 'Enzo Santos'));
  return getGroupBoard(
    {
      schedule,
      bookings: s.bookings,
      payments: s.payments,
      customers,
      vehicles: fakeVehicleRepository(),
    },
    ctx,
    { groupId: group.id },
  );
}

describe('GR-04: desconto em percentual sobre o total', () => {
  it('10% de 3.580,00 derruba o contratado para 3.222,00', async () => {
    const s = seed();

    const result = await discountBookingTotal(s.deps, ctx, {
      bookingId: 'bk-1',
      reason: 'negociado por telefone',
      mode: 'percent',
      value: 10,
    });

    expect(Number(result.totalCents)).toBe(322200);
  });

  it('o desconto é rateado entre os participantes, não jogado num só', async () => {
    const s = seed();

    const result = await discountBookingTotal(s.deps, ctx, {
      bookingId: 'bk-1',
      reason: 'negociado',
      mode: 'percent',
      value: 10,
    });

    expect(result.booking.participants.map((p) => Number(p.unitPriceCents))).toEqual([
      260100, 62100,
    ]);
  });

  it('cada linha tocada guarda o motivo e passa a ter origem override (§3.4)', async () => {
    const s = seed();

    const result = await discountBookingTotal(s.deps, ctx, {
      bookingId: 'bk-1',
      reason: 'permuta com fornecedor',
      mode: 'percent',
      value: 10,
    });

    for (const participant of result.booking.participants) {
      expect(participant.priceSource).toBe('override');
      expect(participant.priceNote).toBe('permuta com fornecedor');
    }
  });
});

describe('GR-04: desconto em valor', () => {
  it('abate exatamente o que foi digitado', async () => {
    const s = seed();

    const result = await discountBookingTotal(s.deps, ctx, {
      bookingId: 'bk-1',
      reason: 'cortesia parcial',
      mode: 'fixed',
      value: 58000,
    });

    expect(Number(result.totalCents)).toBe(300000);
  });

  it('desconto igual ao total é cortesia integral — a inscrição fica valendo zero', async () => {
    const s = seed();

    const result = await discountBookingTotal(s.deps, ctx, {
      bookingId: 'bk-1',
      reason: 'cortesia',
      mode: 'fixed',
      value: 358000,
    });

    expect(Number(result.totalCents)).toBe(0);
    expect(result.booking.participants.every((p) => Number(p.unitPriceCents) === 0)).toBe(true);
  });
});

describe('GR-04: a mesa sabe que a linha foi ajustada', () => {
  /**
   * O botão de restaurar só aparece quando há o que restaurar, e é a mesa quem diz. Sem
   * este sinal, ou o botão vive aparecendo em inscrição intocada, ou a tela precisaria
   * varrer os participantes por conta própria — regra de negócio em componente.
   */
  it('linha sem ajuste não está marcada', async () => {
    const s = seed();

    const board = await boardOf(s);

    expect(board.rows[0]!.priceAdjusted).toBe(false);
  });

  it('linha ajustada fica marcada', async () => {
    const s = seed();
    await discountBookingTotal(s.deps, ctx, {
      bookingId: 'bk-1',
      reason: 'negociado',
      mode: 'percent',
      value: 10,
    });

    const board = await boardOf(s);

    expect(board.rows[0]!.priceAdjusted).toBe(true);
  });
});

describe('GR-07: a mesa diz quem são as pessoas da inscrição', () => {
  /**
   * A linha mostra o responsável; quem viaja com ele só aparecia como contagem. Para
   * conferir a família — quem é criança, quanto vale cada um — era preciso abrir a ficha
   * do cliente e voltar. O nome vem do servidor porque é ele que resolve cliente por id;
   * a tela não busca pessoa uma a uma.
   */
  it('cada participante vem com nome, categoria e unitário', async () => {
    const s = seed();

    const board = await boardOf(s);

    expect(board.rows[0]!.participants).toEqual([
      {
        customerId: 'resp',
        fullName: 'Vanessa Santos',
        priceCategory: 'COUPLE',
        unitPriceCents: 289000,
      },
      {
        customerId: 'kid',
        fullName: 'Enzo Santos',
        priceCategory: 'CHILD_MID',
        unitPriceCents: 69000,
      },
    ]);
  });

  it('participante que sumiu do cadastro não quebra a linha', async () => {
    const s = seed();
    s.bookings.rows[0] = {
      ...s.bookings.rows[0]!,
      participants: [
        ...s.bookings.rows[0]!.participants,
        {
          id: 'p3',
          customerId: 'fantasma',
          priceCategory: 'EXTRA_ADULT',
          unitPriceCents: cents(120000),
          priceSource: 'auto',
          priceNote: null,
        },
      ],
    };

    const board = await boardOf(s);

    expect(board.rows[0]!.participants[2]!.fullName).toBe('—');
  });
});

describe('GR-04: o que o desconto recusa', () => {
  it('motivo em branco — desconto sem motivo é dinheiro que some sem explicação', async () => {
    const s = seed();

    await expect(
      discountBookingTotal(s.deps, ctx, {
        bookingId: 'bk-1',
        reason: '   ',
        mode: 'percent',
        value: 10,
      }),
    ).rejects.toBeInstanceOf(RequiredFieldError);
  });

  it('desconto de zero não é ajuste — recusa em vez de gravar override à toa', async () => {
    const s = seed();

    await expect(
      discountBookingTotal(s.deps, ctx, {
        bookingId: 'bk-1',
        reason: 'nada',
        mode: 'fixed',
        value: 0,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('desconto maior que o total', async () => {
    const s = seed();

    await expect(
      discountBookingTotal(s.deps, ctx, {
        bookingId: 'bk-1',
        reason: 'exagero',
        mode: 'fixed',
        value: 358001,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('percentual acima de 100', async () => {
    const s = seed();

    await expect(
      discountBookingTotal(s.deps, ctx, {
        bookingId: 'bk-1',
        reason: 'exagero',
        mode: 'percent',
        value: 101,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  /**
   * A mesma trava do cupom (CP-07): descontar abaixo do que já entrou produziria saldo
   * negativo, que o sistema leria como "a empresa deve". Devolução é outro caminho (§3.6).
   */
  it('CP-07: desconto que deixaria o contratado abaixo do já recebido', async () => {
    const s = seed();
    await s.payments.create(
      {
        tenantId: 'tenant-a',
        bookingId: 'bk-1',
        amountCents: cents(330000),
        paidAt: { year: 2026, month: 8, day: 1 },
        method: 'pix',
        reference: null,
        notes: null,
        createdBy: 'u1',
      },
      null,
    );

    await expect(
      discountBookingTotal(s.deps, ctx, {
        bookingId: 'bk-1',
        reason: 'tarde demais',
        mode: 'percent',
        value: 50,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('inscrição cancelada não é reprecificada', async () => {
    const s = seed('cancelled');

    await expect(
      discountBookingTotal(s.deps, ctx, {
        bookingId: 'bk-1',
        reason: 'tarde',
        mode: 'percent',
        value: 10,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('inscrição inexistente', async () => {
    const s = seed();

    await expect(
      discountBookingTotal(s.deps, ctx, {
        bookingId: 'nao-existe',
        reason: 'x',
        mode: 'percent',
        value: 10,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('GR-04: quem desconta, e o rastro', () => {
  /** Desconto é decisão comercial, do mesmo peso da confirmação manual (IN-10 · CP-06). */
  it('operator não dá desconto', async () => {
    const s = seed();

    await expect(
      discountBookingTotal(
        s.deps,
        { ...ctx, actor: { kind: 'team', userId: 'u2', role: 'operator' } },
        { bookingId: 'bk-1', reason: 'sem alçada', mode: 'percent', value: 10 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não dá desconto a si mesmo', async () => {
    const s = seed();

    await expect(
      discountBookingTotal(
        s.deps,
        { ...ctx, actor: { kind: 'customer', customerId: 'resp', userId: 'u9' } },
        { bookingId: 'bk-1', reason: 'quero', mode: 'percent', value: 50 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a trilha guarda quanto, por quê e de quanto para quanto', async () => {
    const s = seed();

    await discountBookingTotal(s.deps, ctx, {
      bookingId: 'bk-1',
      reason: 'negociado por telefone',
      mode: 'percent',
      value: 10,
    });

    const entry = s.audit.rows.find((row) => row.action === 'booking.discount');
    expect(entry).toMatchObject({ entity: 'booking', entityId: 'bk-1', actorUserId: 'u1' });
    expect(entry?.diff).toMatchObject({
      mode: 'percent',
      value: 10,
      discountCents: 35800,
      fromCents: 358000,
      toCents: 322200,
      reason: 'negociado por telefone',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate, type PriceCategory } from '@expedition/domain';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakePaymentRepository } from '../payments/paymentRepository.fake.js';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import { buildBookingContext } from './buildBookingContext.js';
import type { BookingRecord } from '../bookings/bookingRepository.js';
import type { RequestContext } from '../context.js';

/**
 * AU-16 — o contexto que os gatilhos de inscrição entregam.
 *
 * Enquanto foi só `inscricao.id`, automação nenhuma tinha como falar com cliente: não havia de
 * onde tirar nome, valor nem saída. Esta é a leitura que enche o contexto — e ela **nunca
 * lança**, porque um erro aqui viraria gatilho que não dispara, e gatilho que não dispara é
 * invisível: sem erro, sem log, sem nada para investigar.
 */

const CPF_DA_FIXTURE = '900.000.100-57';

const team: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

/** PG-03: o webhook do gateway age como o sistema, sem usuário por trás. */
const sistema: RequestContext = { tenantId: 'tenant-a', actor: { kind: 'system' } };

async function seed() {
  const bookings = fakeBookingRepository();
  const schedule = fakeScheduleRepository();
  const customers = fakeCustomerRepository();
  const payments = fakePaymentRepository(bookings.rows);
  const itineraries = fakeItineraryRepository();

  const roteiro = await itineraries.create(
    {
      tenantId: 'tenant-a',
      name: 'Coxilha Rica',
      slug: 'coxilha-rica',
      description: null,
      difficulty: null,
      status: 'active',
      kind: 'catalog',
      childYoungMaxAge: 5,
      childMidMaxAge: 11,
    },
    { validFrom: parseLocalDate('2026-01-01'), prices: {} as never },
  );

  const cliente = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: null,
    fullName: 'Vanessa Santos',
    cpf: parseCpf(CPF_DA_FIXTURE),
    birthDate: parseLocalDate('1990-03-04'),
    email: 'vanessa@exemplo.com',
    phone: '5548999998877',
    address: EMPTY_ADDRESS,
  });

  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: 'tenant-a',
      itineraryId: roteiro.id,
      startDate: parseLocalDate('2026-11-10'),
      endDate: parseLocalDate('2026-11-14'),
      title: null,
      notes: null,
      status: 'scheduled',
    },
    {
      name: 'Coxilha Rica · 10/11/2026',
      status: 'open',
      capacityVehicles: null,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );

  const inscricao: BookingRecord = {
    id: 'bk-1',
    groupId: group.id,
    responsibleCustomerId: cliente.id,
    status: 'confirmed',
    source: 'portal',
    invoiceChecked: false,
    checkedInAt: null,
    participants: [
      {
        id: 'bk-1-p0',
        customerId: cliente.id,
        priceCategory: 'SOLO' as PriceCategory,
        unitPriceCents: cents(150000),
        priceSource: 'auto',
        priceNote: null,
      },
      {
        id: 'bk-1-p1',
        customerId: cliente.id,
        priceCategory: 'SOLO' as PriceCategory,
        unitPriceCents: cents(150000),
        priceSource: 'auto',
        priceNote: null,
      },
    ],
  };
  bookings.rows.push(inscricao);

  const receber = (amountCents: number, kind: 'payment' | 'refund') =>
    payments.create(
      {
        tenantId: 'tenant-a',
        bookingId: 'bk-1',
        paidAt: parseLocalDate('2026-09-10'),
        amountCents: cents(amountCents),
        kind,
        method: 'pix',
        reference: null,
        notes: null,
        createdBy: 'u1',
      },
      null,
    );

  const trocarInscricao = (patch: Partial<BookingRecord>): void => {
    const indice = bookings.rows.findIndex((linha) => linha.id === 'bk-1');
    bookings.rows[indice] = { ...bookings.rows[indice]!, ...patch };
  };

  return {
    deps: { bookings, schedule, customers, payments, itineraries },
    receber,
    trocarInscricao,
    group,
    cliente,
  };
}

describe('AU-16: o contexto de uma inscrição', () => {
  it('traz o contato, a inscrição e a saída', async () => {
    const { deps } = await seed();

    const contexto = await buildBookingContext(deps, team, { bookingId: 'bk-1' });

    expect(contexto['contato']).toEqual({
      nome: 'Vanessa Santos',
      telefone: '5548999998877',
      email: 'vanessa@exemplo.com',
    });
    expect(contexto['saida']).toEqual({
      nome: 'Coxilha Rica · 10/11/2026',
      roteiro: 'Coxilha Rica',
      inicio: '2026-11-10',
      fim: '2026-11-14',
    });
    expect(contexto['inscricao']).toMatchObject({
      id: 'bk-1',
      status: 'confirmed',
      pessoas: 2,
      origem: 'portal',
      totalCents: 300000,
    });
  });

  /**
   * §3.6 — devolução e conversão em crédito entram **negativas** no ledger, então a soma já
   * sai líquida. É o mesmo número da mesa (GR-07), e precisa continuar sendo: uma mensagem
   * dizendo "faltam X" que discorde do painel é pior que mensagem nenhuma.
   */
  it('o recebido é líquido — estorno desconta', async () => {
    const { deps, receber } = await seed();
    await receber(100000, 'payment');
    await receber(-30000, 'refund');

    const contexto = await buildBookingContext(deps, team, { bookingId: 'bk-1' });

    expect(contexto['inscricao']).toMatchObject({ recebidoCents: 70000, saldoCents: 230000 });
  });

  /** CP-05: o saldo sai do contratado, que já é subtotal menos cupom. */
  it('o saldo desconta o cupom aplicado', async () => {
    const { deps, trocarInscricao } = await seed();
    trocarInscricao({
      discount: { couponId: 'cp-1', code: 'AMIGO10', discountCents: cents(50000) },
    });

    const contexto = await buildBookingContext(deps, team, { bookingId: 'bk-1' });

    expect(contexto['inscricao']).toMatchObject({ totalCents: 250000, saldoCents: 250000 });
  });

  /**
   * A leitura que falha vira campo vazio, nunca gatilho perdido. É a regra do AU-09 aplicada à
   * borda: mensagem sem o nome da saída aparece no log de passos (AU-06) e alguém conserta;
   * execução que nunca foi enfileirada não deixa rastro nenhum.
   */
  it('saída excluída deixa os campos vazios, e não derruba o gatilho', async () => {
    const { deps, trocarInscricao } = await seed();
    trocarInscricao({ groupId: 'grupo-que-nao-existe' });

    const contexto = await buildBookingContext(deps, team, { bookingId: 'bk-1' });

    expect(contexto['saida']).toEqual({ nome: '', roteiro: '', inicio: '', fim: '' });
    expect(contexto['inscricao']).toMatchObject({ id: 'bk-1', status: 'confirmed' });
  });

  /** Sem a inscrição não há o que montar — sobra o id, que é o contexto de antes desta fatia. */
  it('inscrição inexistente devolve só o id', async () => {
    const { deps } = await seed();

    const contexto = await buildBookingContext(deps, team, { bookingId: 'bk-sumiu' });

    expect(contexto).toEqual({ inscricao: { id: 'bk-sumiu' } });
  });

  /**
   * AU-20 — **CPF não entra em contexto de automação.** O contexto vira texto de mensagem e
   * pode sair numa chamada de URL (AU-21); documento de identidade não passeia por aí. Aqui
   * como teste, e não como cuidado, porque cuidado se esquece no campo seguinte.
   */
  it('não vaza CPF', async () => {
    const { deps } = await seed();

    const contexto = await buildBookingContext(deps, team, { bookingId: 'bk-1' });

    expect(JSON.stringify(contexto)).not.toContain('90000010057');
    expect(JSON.stringify(contexto)).not.toContain(CPF_DA_FIXTURE);
  });

  /**
   * Sem guarda de audiência, de propósito: quem chega aqui é o webhook do gateway (PG-03), sem
   * usuário por trás. A audiência já foi decidida na rota que causou o acontecimento — pôr uma
   * guarda aqui faria o gatilho do pagamento pelo ASAAS morrer dentro de um `catch`.
   */
  it('o sistema monta o mesmo contexto que a equipe', async () => {
    const { deps } = await seed();

    const pelaEquipe = await buildBookingContext(deps, team, { bookingId: 'bk-1' });
    const peloSistema = await buildBookingContext(deps, sistema, { bookingId: 'bk-1' });

    expect(peloSistema).toEqual(pelaEquipe);
  });
});

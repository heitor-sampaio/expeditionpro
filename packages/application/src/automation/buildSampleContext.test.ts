import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate, type PriceCategory } from '@expedition/domain';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakePaymentRepository } from '../payments/paymentRepository.fake.js';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import { buildSampleContext } from './buildSampleContext.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { BookingRecord } from '../bookings/bookingRepository.js';
import type { RequestContext } from '../context.js';

/**
 * AU-25 — de onde sai o contexto de um ensaio.
 *
 * Ensaiar exigia **digitar** cada campo do gatilho, e depois que os gatilhos de inscrição
 * passaram a trazer contato, saída e dinheiro, isso virou dezoito caixas de texto para
 * preencher antes de ver qualquer coisa. Ninguém confere um fluxo assim: inventa três valores,
 * erra o quarto, e conclui sobre uma automação que nunca vai receber esses dados.
 *
 * A saída é escolher uma inscrição **de verdade** e deixar o sistema montar o contexto do jeito
 * exato que o gatilho montaria — a mesma função, para o ensaio não responder por um contexto
 * que a execução real não teria.
 */

const team: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
const viewer: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u9', role: 'viewer' },
};
const cliente: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u2', customerId: 'c1' },
};

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

  const pessoa = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: null,
    fullName: 'Vanessa Santos',
    cpf: parseCpf('900.000.100-57'),
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
    responsibleCustomerId: pessoa.id,
    status: 'pending',
    source: 'portal',
    invoiceChecked: false,
    checkedInAt: null,
    participants: [
      {
        id: 'bk-1-p0',
        customerId: pessoa.id,
        priceCategory: 'SOLO' as PriceCategory,
        unitPriceCents: cents(120000),
        priceSource: 'auto',
        priceNote: null,
      },
    ],
  };
  bookings.rows.push(inscricao);

  return { deps: { bookings, schedule, customers, payments, itineraries } };
}

const AGORA = new Date('2026-09-10T23:30:00.000Z');

describe('AU-25: o contexto de amostra vem de uma inscrição de verdade', () => {
  it('monta o mesmo contexto que o gatilho montaria', async () => {
    const { deps } = await seed();

    const contexto = await buildSampleContext(deps, team, {
      source: { kind: 'inscricao', bookingId: 'bk-1' },
      now: AGORA,
    });

    expect(contexto).toMatchObject({
      contato: { nome: 'Vanessa Santos', telefone: '5548999998877' },
      inscricao: { id: 'bk-1', status: 'pending', origem: 'portal', totalCents: 120000 },
      saida: { roteiro: 'Coxilha Rica', inicio: '2026-11-10' },
    });
  });

  /**
   * Aqui o silêncio seria erro. No gatilho, inscrição não encontrada degrada para o id e a
   * automação segue — perder o gatilho seria pior. No ensaio é o contrário: quem escolheu uma
   * inscrição na lista precisa saber que ela sumiu, senão lê um fluxo inteiro com contexto
   * vazio achando que o desenho é que está errado.
   */
  it('inscrição que não existe é erro, e não contexto vazio', async () => {
    const { deps } = await seed();

    await expect(
      buildSampleContext(deps, team, {
        source: { kind: 'inscricao', bookingId: 'bk-sumiu' },
        now: AGORA,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  /*
   * Inscrição de outro tenant não é testada aqui de propósito: o fake ignora o `tenantId`
   * (`void tenantId`), e um teste em cima dele provaria o fake, não a regra. O isolamento vive
   * onde é imposto — na Prisma Client Extension e na RLS —, e é lá que já está provado.
   */

  /** Ensaiar não manda nada e não grava nada: quem lê o quadro pode percorrê-lo. */
  it('o viewer também ensaia', async () => {
    const { deps } = await seed();

    const contexto = await buildSampleContext(deps, viewer, {
      source: { kind: 'inscricao', bookingId: 'bk-1' },
      now: AGORA,
    });

    expect(contexto['inscricao']).toMatchObject({ id: 'bk-1' });
  });

  it('o cliente não ensaia: o quadro não é dele', async () => {
    const { deps } = await seed();

    await expect(
      buildSampleContext(deps, cliente, {
        source: { kind: 'inscricao', bookingId: 'bk-1' },
        now: AGORA,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/**
 * AU-17 — o gatilho de tempo em tempo não pende de entidade nenhuma: o contexto dele é o
 * relógio, e não há o que escolher numa lista.
 */
describe('AU-25: o contexto de amostra do gatilho de tempo', () => {
  it('traz a data e a hora no fuso da operação', async () => {
    const { deps } = await seed();

    const contexto = await buildSampleContext(deps, team, {
      source: { kind: 'agora' },
      now: AGORA,
    });

    // 23:30 em UTC ainda é dia 10 às 20:30 em Brasília — sem o deslocamento, o ensaio
    // anunciaria a data de amanhã para quem está lendo hoje.
    expect(contexto).toEqual({ agora: { data: '2026-09-10', hora: '20:30' } });
  });
});

import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate, type MappedIntake } from '@expedition/domain';
import { fakeIntakeRepository } from './intakeRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { fakeCashbackRepository } from '../cashback/cashbackRepository.fake.js';
import { fakeLegalDocumentRepository } from '../documents/legalDocumentRepository.fake.js';
import { fakeIdentityChangeRepository } from '../identity/identityChangeRepository.fake.js';
import { fakeTenantRepository } from '../tenants/tenantRepository.fake.js';
import { passthroughUnitOfWork } from '../transaction/unitOfWork.js';
import { allocateFromQueue } from './allocateFromQueue.js';
import { discardIntake } from './discardIntake.js';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

const FIXED = new Date('2026-08-25T12:00:00.000Z');
const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

function normalized(): MappedIntake {
  return {
    formId: '4641',
    entryId: '101',
    submitted: '2026-08-11T18:57:17-03:00',
    desiredDate: parseLocalDate('2025-11-10'),
    responsible: {
      fullName: 'Heitor Sampaio',
      cpf: parseCpf('90000010057'),
      birthDate: parseLocalDate('1989-01-14'),
      email: 'contato@exemplo.com',
      phone: '48999998877',
    },
    address: {
      street: 'Rua Luiz Pasteur',
      number: '509',
      district: 'Trindade',
      city: 'Florianópolis',
      state: 'SC',
      zip: '88036100',
    },
    vehicle: { brand: 'Ford', model: 'Ranger', plate: 'ABC-1234', plateValid: true },
    companions: [
      {
        fullName: 'Fulana de Tal',
        cpf: parseCpf('12345678909'),
        birthDate: parseLocalDate('1990-05-20'),
      },
    ],
    consent: true,
    warnings: [],
    customFields: {},
  };
}

async function setup() {
  const intake = fakeIntakeRepository();
  const customers = fakeCustomerRepository();
  const bookings = fakeBookingRepository();
  const schedule = fakeScheduleRepository();
  const itineraries = fakeItineraryRepository();

  const itin = await itineraries.create(
    {
      tenantId: ctx.tenantId,
      name: 'Coxilha Rica',
      slug: 'coxilha-rica',
      description: null,
      difficulty: null,
      status: 'active',
      kind: 'catalog',
      childYoungMaxAge: 5,
      childMidMaxAge: 10,
    },
    {
      validFrom: parseLocalDate('2025-01-01'),
      prices: {
        coupleCents: cents(200000),
        soloCents: cents(120000),
        extraAdultCents: cents(80000),
        childMidCents: cents(60000),
        childYoungCents: cents(40000),
      },
    },
  );
  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: ctx.tenantId,
      itineraryId: itin.id,
      startDate: parseLocalDate('2025-11-10'),
      endDate: parseLocalDate('2025-11-14'),
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
  const stored = await intake.store({
    tenantId: ctx.tenantId,
    source: 'wp_flat_v1',
    externalId: '4641:101',
    payload: {},
    normalized: normalized(),
    formId: '4641',
    submittedAt: null,
    status: 'needs_allocation',
    error: null,
    itineraryId: null,
    isTest: false,
  });

  const cashback = fakeCashbackRepository();
  const documents = fakeLegalDocumentRepository();
  const identityRequests = fakeIdentityChangeRepository();
  const tenants = fakeTenantRepository({
    name: 'Drakkar Expedições',
    cnpj: '12345678000199',
    slug: 'drk',
    logo: null,
  });
  const uow = passthroughUnitOfWork({
    customers,
    bookings,
    schedule,
    itineraries,
    cashback,
    intake,
    documents,
    identityRequests,
  });
  const deps = { uow, clock: () => FIXED, tenants };
  return {
    deps,
    intake,
    customers,
    bookings,
    documents,
    identityRequests,
    group,
    intakeId: stored.id,
  };
}

/** Publica um Termo vigente no repositório fake (para os testes de captura de aceite). */
async function publishTerm(documents: ReturnType<typeof fakeLegalDocumentRepository>) {
  const doc = await documents.ensureTermDocument('tenant-a', 'Termo de Adesão');
  await documents.saveDraft({
    tenantId: 'tenant-a',
    documentId: doc.id,
    contentJson: { markdown: '## Termo' },
    contentHtml: '<h2>Termo</h2>',
  });
  await documents.publishDraft({
    tenantId: 'tenant-a',
    documentId: doc.id,
    requiresReacceptance: false,
    changeSummary: null,
    publishedBy: 'u1',
    publishedAt: FIXED,
  });
}

describe('IN-18/§5.7.2: alocação a partir da fila', () => {
  it('cria cliente + acompanhante por CPF, cria booking pending com snapshot e marca allocated', async () => {
    const { deps, intake, customers, bookings, group, intakeId } = await setup();

    const result = await allocateFromQueue(deps, ctx, { intakeId, groupId: group.id });

    expect(result.participantCount).toBe(2);
    expect(customers.rows).toHaveLength(2); // responsável + acompanhante
    expect(customers.rows[1]!.responsibleId).toBe(customers.rows[0]!.id); // vínculo
    expect(bookings.rows).toHaveLength(1);
    expect(bookings.rows[0]!.status).toBe('pending');
    // casal (2 adultos): total 200000
    const total = bookings.rows[0]!.participants.reduce((s, p) => s + p.unitPriceCents, 0);
    expect(total).toBe(200000);
    // intake saiu da fila
    expect(intake.rows[0]!.status).toBe('allocated');
  });

  it('IN-03: reaproveita cliente existente por CPF em vez de recriar', async () => {
    const { deps, customers, group, intakeId } = await setup();
    // responsável já existe
    await customers.create({
      tenantId: ctx.tenantId,
      responsibleId: null,
      fullName: 'Heitor S.',
      cpf: parseCpf('90000010057'),
      birthDate: parseLocalDate('1989-01-14'),
      email: 'ja@existe.com',
      phone: '48000000000',
      address: {
        street: null,
        number: null,
        district: null,
        city: null,
        state: null,
        zip: null,
      },
    });
    await allocateFromQueue(deps, ctx, { intakeId, groupId: group.id });
    // não recriou o responsável (1 existente + 1 acompanhante = 2, não 3)
    expect(customers.rows.filter((c) => c.cpf === '90000010057')).toHaveLength(1);
  });

  it('recusa intake que não está na fila', async () => {
    const { deps, intake, group, intakeId } = await setup();
    intake.rows[0] = { ...intake.rows[0]!, status: 'allocated' };
    await expect(
      allocateFromQueue(deps, ctx, { intakeId, groupId: group.id }),
    ).rejects.toMatchObject({ code: 'not_allocatable' });
  });

  it('recusa grupo inexistente', async () => {
    const { deps, intakeId } = await setup();
    await expect(
      allocateFromQueue(deps, ctx, { intakeId, groupId: 'nao-existe' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('IN-19: descarta com motivo e tira da fila', async () => {
    const { intake, intakeId } = await setup();
    await discardIntake({ intake }, ctx, { intakeId, reason: 'lead duplicado' });
    expect(intake.rows[0]!.status).toBe('discarded');
  });

  it('IN-19: descartar sem motivo é recusado', async () => {
    const { intake, intakeId } = await setup();
    await expect(discardIntake({ intake }, ctx, { intakeId, reason: '' })).rejects.toMatchObject({
      code: 'required_field',
    });
  });

  it('IN-19: intake já fora da fila não descarta', async () => {
    const { intake, intakeId } = await setup();
    intake.rows[0] = { ...intake.rows[0]!, status: 'discarded' };
    await expect(discardIntake({ intake }, ctx, { intakeId, reason: 'x' })).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });
});

describe('IN-04: divergência de dados na alocação entra na fila de revisão', () => {
  it('CPF conhecido com nome/telefone/e-mail diferentes cria pedido pendente sem sobrescrever', async () => {
    const { deps, customers, identityRequests, group, intakeId } = await setup();
    // responsável já existe, com dados diferentes do que chega na inscrição
    await customers.create({
      tenantId: ctx.tenantId,
      responsibleId: null,
      fullName: 'Heitor S.',
      cpf: parseCpf('90000010057'),
      birthDate: parseLocalDate('1989-01-14'),
      email: 'ja@existe.com',
      phone: '48000000000',
      address: {
        street: null,
        number: null,
        district: null,
        city: null,
        state: null,
        zip: null,
      },
    });

    await allocateFromQueue(deps, ctx, { intakeId, groupId: group.id });

    // reaproveitou (não recriou o responsável): 1 responsável + 1 acompanhante = 2
    expect(customers.rows.filter((c) => c.cpf === '90000010057')).toHaveLength(1);
    // NÃO sobrescreveu o cadastro
    expect(customers.rows.find((c) => c.cpf === '90000010057')!.fullName).toBe('Heitor S.');
    // enfileirou a divergência, pendente, com os valores propostos
    expect(identityRequests.rows).toHaveLength(1);
    const req = identityRequests.rows[0]!;
    expect(req.status).toBe('pending');
    expect(req.fullName).toBe('Heitor Sampaio');
    expect(req.phone).toBe('48999998877');
    expect(req.email).toBe('contato@exemplo.com');
    expect(req.birthDate).toBeNull(); // nascimento igual → não propõe
    expect(req.cpf).toBeNull(); // CPF é a chave do match, nunca diverge
  });

  it('acompanhante conhecido por CPF com nome diferente também entra na fila de revisão', async () => {
    const { deps, customers, identityRequests, group, intakeId } = await setup();
    // o acompanhante já existe (CPF 12345678909), com nome diferente do que chega
    const comp = await customers.create({
      tenantId: ctx.tenantId,
      responsibleId: null,
      fullName: 'Fulana Diferente',
      cpf: parseCpf('12345678909'),
      birthDate: parseLocalDate('1990-05-20'),
      email: null,
      phone: null,
      address: {
        street: null,
        number: null,
        district: null,
        city: null,
        state: null,
        zip: null,
      },
    });

    await allocateFromQueue(deps, ctx, { intakeId, groupId: group.id });

    // reaproveitou o acompanhante (não recriou por CPF)
    expect(customers.rows.filter((c) => c.cpf === '12345678909')).toHaveLength(1);
    // enfileirou a divergência do acompanhante
    const req = identityRequests.rows.find((r) => r.customerId === comp.id);
    expect(req).toBeDefined();
    expect(req!.status).toBe('pending');
    expect(req!.fullName).toBe('Fulana de Tal'); // valor que chegou
  });

  it('CPF conhecido com dados idênticos não cria pedido de revisão', async () => {
    const { deps, customers, identityRequests, group, intakeId } = await setup();
    await customers.create({
      tenantId: ctx.tenantId,
      responsibleId: null,
      fullName: 'Heitor Sampaio',
      cpf: parseCpf('90000010057'),
      birthDate: parseLocalDate('1989-01-14'),
      email: 'contato@exemplo.com',
      phone: '48999998877',
      address: {
        street: null,
        number: null,
        district: null,
        city: null,
        state: null,
        zip: null,
      },
    });

    await allocateFromQueue(deps, ctx, { intakeId, groupId: group.id });

    expect(identityRequests.rows).toHaveLength(0);
  });
});

describe('DOC-04/§5.7.1: aceite do Termo capturado na alocação da inscrição do site', () => {
  it('com termo publicado e aceite="1", grava o aceite no canal site com a data do envio', async () => {
    const { deps, documents, group, intakeId } = await setup();
    await publishTerm(documents);

    const result = await allocateFromQueue(deps, ctx, { intakeId, groupId: group.id });

    expect(documents.acceptances).toHaveLength(1);
    const acc = documents.acceptances[0]!;
    expect(acc.channel).toBe('site');
    expect(acc.customerId).toBe(result.responsibleCustomerId);
    // DOC-08: o snapshot congela a identidade da empresa (nome + CNPJ do tenant)
    expect(acc.variables.empresa_nome).toBe('Drakkar Expedições');
    expect(acc.variables.empresa_cnpj).toBe('12345678000199');
    // data do aceite = "submitted" do formulário, não a hora da alocação
    expect(acc.acceptedAt.toISOString()).toBe(new Date('2026-08-11T18:57:17-03:00').toISOString());
  });

  it('sem termo publicado, aloca normalmente e não grava aceite', async () => {
    const { deps, documents, group, intakeId } = await setup();
    const result = await allocateFromQueue(deps, ctx, { intakeId, groupId: group.id });
    expect(result.bookingId).toBeTruthy();
    expect(documents.acceptances).toHaveLength(0);
  });

  it('é idempotente: não duplica se o cliente já aceitou a versão vigente', async () => {
    const { deps, documents, customers, group, intakeId } = await setup();
    await publishTerm(documents);
    // o responsável já existe e já aceitou a versão vigente
    const resp = await customers.create({
      tenantId: 'tenant-a',
      responsibleId: null,
      fullName: 'Heitor Sampaio',
      cpf: parseCpf('90000010057'),
      birthDate: parseLocalDate('1989-01-14'),
      email: 'contato@exemplo.com',
      phone: '48999998877',
      address: {
        street: null,
        number: null,
        district: null,
        city: null,
        state: null,
        zip: null,
      },
    });
    const current = await documents.getCurrentPublished('tenant-a', documents.docs[0]!.id);
    await documents.recordAcceptance({
      tenantId: 'tenant-a',
      documentVersionId: current!.id,
      customerId: resp.id,
      bookingId: null,
      acceptedAt: FIXED,
      channel: 'portal',
      ip: null,
      userAgent: null,
      pdfPath: null,
      variables: {},
    });

    await allocateFromQueue(deps, ctx, { intakeId, groupId: group.id });
    expect(documents.acceptances).toHaveLength(1); // não duplicou
  });
});

/**
 * §5.8 — o pedido feito no app entra na mesma fila do formulário, mas com os clientes já
 * escolhidos. Aprovar não recria ninguém e **preserva a origem `portal`**, que é o que
 * mantém o cashback (CB-09).
 */
describe('§5.8: aprovação do pedido feito no portal', () => {
  it('aloca com os clientes escolhidos, sem duplicar cadastro, e congela a regra de cashback', async () => {
    const { deps, intake, customers, bookings, group } = await setup();

    const mae = await customers.create({
      tenantId: ctx.tenantId,
      responsibleId: null,
      fullName: 'Vanessa Santos',
      cpf: parseCpf('153.509.460-56'),
      birthDate: parseLocalDate('1990-03-04'),
      email: 'vanessa@example.com',
      phone: '5548999990000',
      address: EMPTY_ADDRESS,
    });
    const filho = await customers.create({
      tenantId: ctx.tenantId,
      responsibleId: mae.id,
      fullName: 'Bruno Santos',
      cpf: parseCpf('277.373.070-44'),
      birthDate: parseLocalDate('2016-07-10'),
      email: null,
      phone: null,
      address: EMPTY_ADDRESS,
    });
    const antes = customers.rows.length;

    const pedido = await intake.store({
      tenantId: ctx.tenantId,
      source: 'portal',
      externalId: null,
      payload: {
        kind: 'portal_enrollment',
        groupId: group.id,
        headCustomerId: mae.id,
        participantCustomerIds: [mae.id, filho.id],
      },
      normalized: normalized(),
      formId: null,
      submittedAt: null,
      status: 'needs_allocation',
      error: null,
      itineraryId: null,
      isTest: false,
    });

    const result = await allocateFromQueue(deps, ctx, {
      intakeId: pedido.id,
      groupId: group.id,
    });

    expect(customers.rows.length).toBe(antes); // não criou cliente a partir do formulário
    const booking = bookings.rows.find((b) => b.id === result.bookingId)!;
    expect(booking.responsibleCustomerId).toBe(mae.id);
    expect(booking.participants.map((p) => p.customerId).sort()).toEqual([mae.id, filho.id].sort());
    expect(booking.source).toBe('portal');
    // CB-09: origem portal é a única que congela regra de cashback
    expect(booking.cashbackRuleSnapshot).toBeDefined();
  });
});

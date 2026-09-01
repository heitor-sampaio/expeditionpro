import { describe, expect, it } from 'vitest';
import {
  cents,
  parseLocalDate,
  InvalidCnpjError,
  InvalidCpfError,
  InvalidPixKeyError,
  type PriceCategory,
} from '@expedition/domain';
import { fakeSupplierRepository } from './supplierRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakePaymentRepository } from '../payments/paymentRepository.fake.js';
import { createSupplier } from './createSupplier.js';
import { updateSupplier } from './updateSupplier.js';
import { createSupplierCategory } from './createSupplierCategory.js';
import { listSupplierCategories } from './listSupplierCategories.js';
import { addSupplierExpense } from './addSupplierExpense.js';
import { registerSupplierPayment } from './registerSupplierPayment.js';
import { getGroupResult } from './getGroupResult.js';
import { listGroupExpenses } from './listGroupExpenses.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { BusinessRuleError, ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { BookingRecord } from '../bookings/bookingRepository.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const audit = fakeAuditLogRepository();

async function seedGroup(schedule: ReturnType<typeof fakeScheduleRepository>) {
  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: ctx.tenantId,
      itineraryId: 'itin-1',
      startDate: parseLocalDate('2025-11-10'),
      endDate: parseLocalDate('2025-11-14'),
      title: null,
      notes: null,
      status: 'scheduled',
    },
    {
      name: 'Coxilha Rica · 10/11/2025',
      status: 'open',
      capacityVehicles: null,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );
  return group;
}

describe('FO-01/GR-08: cadastro de fornecedor', () => {
  it('cria fornecedor com nome, normalizando o documento a dígitos', async () => {
    const suppliers = fakeSupplierRepository();
    const s = await createSupplier({ suppliers }, ctx, {
      name: 'Pousada do Vale',
      doc: '11.222.333/0001-81',
      docType: 'cnpj',
    });
    expect(s.name).toBe('Pousada do Vale');
    expect(s.doc).toBe('11222333000181');
    expect(s.docType).toBe('cnpj');
  });

  it('FO-01: CNPJ com dígito verificador errado é recusado', async () => {
    const suppliers = fakeSupplierRepository();
    await expect(
      createSupplier({ suppliers }, ctx, {
        name: 'X',
        doc: '11.222.333/0001-82',
        docType: 'cnpj',
      }),
    ).rejects.toBeInstanceOf(InvalidCnpjError);
  });

  it('FO-01: CPF com dígito verificador errado é recusado', async () => {
    const suppliers = fakeSupplierRepository();
    await expect(
      createSupplier({ suppliers }, ctx, { name: 'X', doc: '90000010000', docType: 'cpf' }),
    ).rejects.toBeInstanceOf(InvalidCpfError);
  });

  it('FO-01: sem docType, infere pelo tamanho (11=CPF, 14=CNPJ) e valida', async () => {
    const suppliers = fakeSupplierRepository();
    const cpf = await createSupplier({ suppliers }, ctx, { name: 'Guia', doc: '900.000.100-57' });
    expect(cpf.doc).toBe('90000010057');
    expect(cpf.docType).toBe('cpf');
    const cnpj = await createSupplier({ suppliers }, ctx, {
      name: 'Pousada',
      doc: '11222333000181',
    });
    expect(cnpj.docType).toBe('cnpj');
  });

  it('FO-01: documento com tamanho que não é CPF nem CNPJ é recusado', async () => {
    const suppliers = fakeSupplierRepository();
    await expect(
      createSupplier({ suppliers }, ctx, { name: 'X', doc: '123456' }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('nome obrigatório', async () => {
    const suppliers = fakeSupplierRepository();
    await expect(createSupplier({ suppliers }, ctx, { name: '   ' })).rejects.toBeInstanceOf(
      RequiredFieldError,
    );
  });

  it('documento duplicado no tenant é recusado', async () => {
    const suppliers = fakeSupplierRepository();
    await createSupplier({ suppliers }, ctx, { name: 'A', doc: '11222333000181', docType: 'cnpj' });
    await expect(
      createSupplier({ suppliers }, ctx, { name: 'B', doc: '11.222.333/0001-81', docType: 'cnpj' }),
    ).rejects.toMatchObject({ code: 'duplicate_supplier' });
  });
});

describe('FO-04: categorias e edição de fornecedor', () => {
  it('cria categoria e não duplica por nome (idempotente)', async () => {
    const suppliers = fakeSupplierRepository();
    const a = await createSupplierCategory({ suppliers, audit }, ctx, { name: 'Hospedagem' });
    const b = await createSupplierCategory({ suppliers, audit }, ctx, { name: 'Hospedagem' });
    expect(a.id).toBe(b.id);
    expect(await listSupplierCategories({ suppliers }, ctx)).toHaveLength(1);
  });

  it('cria fornecedor com categoria e resolve o nome', async () => {
    const suppliers = fakeSupplierRepository();
    const cat = await createSupplierCategory({ suppliers, audit }, ctx, { name: 'Transporte' });
    const s = await createSupplier({ suppliers }, ctx, { name: 'Van do Zé', categoryId: cat.id });
    expect(s.categoryId).toBe(cat.id);
    expect(s.categoryName).toBe('Transporte');
  });

  it('recusa categoria de outro tenant', async () => {
    const suppliers = fakeSupplierRepository();
    const other: RequestContext = {
      tenantId: 'tenant-b',
      actor: { kind: 'team', userId: 'u9', role: 'admin' },
    };
    const cat = await createSupplierCategory({ suppliers, audit }, other, { name: 'X' });
    await expect(
      createSupplier({ suppliers }, ctx, { name: 'Y', categoryId: cat.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('edita nome, contato, observações e categoria', async () => {
    const suppliers = fakeSupplierRepository();
    const s = await createSupplier({ suppliers }, ctx, { name: 'Antigo' });
    const cat = await createSupplierCategory({ suppliers, audit }, ctx, { name: 'Alimentação' });
    const up = await updateSupplier({ suppliers }, ctx, {
      id: s.id,
      name: 'Novo',
      phone: '5199',
      notes: 'combinado',
      categoryId: cat.id,
    });
    expect(up.name).toBe('Novo');
    expect(up.phone).toBe('5199');
    expect(up.notes).toBe('combinado');
    expect(up.categoryName).toBe('Alimentação');
  });

  it('editar documento revalida e barra duplicado de outro fornecedor', async () => {
    const suppliers = fakeSupplierRepository();
    await createSupplier({ suppliers }, ctx, {
      name: 'A',
      doc: '11222333000181',
      docType: 'cnpj',
    });
    const b = await createSupplier({ suppliers }, ctx, { name: 'B' });
    await expect(
      updateSupplier({ suppliers }, ctx, {
        id: b.id,
        doc: '11.222.333/0001-81',
        docType: 'cnpj',
      }),
    ).rejects.toMatchObject({ code: 'duplicate_supplier' });
  });

  it('editar mantendo o próprio documento não acusa duplicado', async () => {
    const suppliers = fakeSupplierRepository();
    const a = await createSupplier({ suppliers }, ctx, {
      name: 'A',
      doc: '11222333000181',
      docType: 'cnpj',
    });
    const up = await updateSupplier({ suppliers }, ctx, {
      id: a.id,
      doc: '11222333000181',
      docType: 'cnpj',
      name: 'A2',
    });
    expect(up.name).toBe('A2');
    expect(up.doc).toBe('11222333000181');
  });

  it('rejeita editar fornecedor inexistente', async () => {
    const suppliers = fakeSupplierRepository();
    await expect(
      updateSupplier({ suppliers }, ctx, { id: 'fantasma', name: 'y' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('GR-08: gasto de fornecedor no grupo', () => {
  it('adiciona gasto ao grupo com valor contratado', async () => {
    const suppliers = fakeSupplierRepository();
    const schedule = fakeScheduleRepository();
    const group = await seedGroup(schedule);
    const sup = await createSupplier({ suppliers }, ctx, { name: 'Guia local' });

    const exp = await addSupplierExpense({ suppliers, schedule }, ctx, {
      groupId: group.id,
      supplierId: sup.id,
      description: 'Guia 4 dias',
      totalCents: 300000,
    });
    expect(exp.totalCents).toBe(300000);
    expect(exp.supplierId).toBe(sup.id);
  });

  it('grupo inexistente é recusado', async () => {
    const suppliers = fakeSupplierRepository();
    const schedule = fakeScheduleRepository();
    const sup = await createSupplier({ suppliers }, ctx, { name: 'X' });
    await expect(
      addSupplierExpense({ suppliers, schedule }, ctx, {
        groupId: 'nao-existe',
        supplierId: sup.id,
        description: 'x',
        totalCents: 1000,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('fornecedor inexistente é recusado', async () => {
    const suppliers = fakeSupplierRepository();
    const schedule = fakeScheduleRepository();
    const group = await seedGroup(schedule);
    await expect(
      addSupplierExpense({ suppliers, schedule }, ctx, {
        groupId: group.id,
        supplierId: 'fantasma',
        description: 'x',
        totalCents: 1000,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('valor não positivo é recusado', async () => {
    const suppliers = fakeSupplierRepository();
    const schedule = fakeScheduleRepository();
    const group = await seedGroup(schedule);
    const sup = await createSupplier({ suppliers }, ctx, { name: 'X' });
    await expect(
      addSupplierExpense({ suppliers, schedule }, ctx, {
        groupId: group.id,
        supplierId: sup.id,
        description: 'x',
        totalCents: 0,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe('GR-09: pagamento a fornecedor', () => {
  it('registra pagamento parcial num gasto', async () => {
    const suppliers = fakeSupplierRepository();
    const schedule = fakeScheduleRepository();
    const group = await seedGroup(schedule);
    const sup = await createSupplier({ suppliers }, ctx, { name: 'X' });
    const exp = await addSupplierExpense({ suppliers, schedule }, ctx, {
      groupId: group.id,
      supplierId: sup.id,
      description: 'x',
      totalCents: 300000,
    });
    const pay = await registerSupplierPayment({ suppliers }, ctx, {
      expenseId: exp.id,
      amountCents: 100000,
      method: 'pix',
      paidAt: '2025-11-01',
    });
    expect(pay.amountCents).toBe(100000);
  });

  it('cliente não registra pagamento a fornecedor (403)', async () => {
    const suppliers = fakeSupplierRepository();
    await expect(
      registerSupplierPayment(
        { suppliers },
        { tenantId: 'tenant-a', actor: { kind: 'customer', customerId: 'c1', userId: 'u2' } },
        { expenseId: 'e1', amountCents: 1000, method: 'pix', paidAt: '2025-11-01' },
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('GR-10: resultado do grupo (receita − gastos, margem)', () => {
  function pushBooking(
    bookings: ReturnType<typeof fakeBookingRepository>,
    groupId: string,
    id: string,
    status: string,
    total: number,
  ) {
    const record: BookingRecord = {
      id,
      groupId,
      responsibleCustomerId: `resp-${id}`,
      status,
      source: 'manual',
      invoiceChecked: false,
      participants: [
        {
          id: `${id}-p`,
          customerId: `${id}-c`,
          priceCategory: 'SOLO' as PriceCategory,
          unitPriceCents: cents(total),
          priceSource: 'auto',
          priceNote: null,
        },
      ],
    };
    bookings.rows.push(record);
  }

  it('receita = contratado confirmado; margem = receita − gastos; pago e a pagar do fornecedor', async () => {
    const suppliers = fakeSupplierRepository();
    const schedule = fakeScheduleRepository();
    const bookings = fakeBookingRepository();
    const payments = fakePaymentRepository(bookings.rows);
    const group = await seedGroup(schedule);

    pushBooking(bookings, group.id, 'bk-c', 'confirmed', 1000000);
    pushBooking(bookings, group.id, 'bk-p', 'pending', 500000); // pendente não entra na receita
    await payments.create(
      {
        tenantId: ctx.tenantId,
        bookingId: 'bk-c',
        paidAt: parseLocalDate('2025-11-01'),
        amountCents: cents(400000),
        method: 'pix',
        reference: null,
        notes: null,
        createdBy: null,
      },
      null,
    );

    const sup = await createSupplier({ suppliers }, ctx, { name: 'Fornecedor' });
    const exp = await addSupplierExpense({ suppliers, schedule }, ctx, {
      groupId: group.id,
      supplierId: sup.id,
      description: 'serviço',
      totalCents: 600000,
    });
    await registerSupplierPayment({ suppliers }, ctx, {
      expenseId: exp.id,
      amountCents: 250000,
      method: 'pix',
      paidAt: '2025-11-02',
    });

    const result = await getGroupResult({ schedule, bookings, payments, suppliers }, ctx, {
      groupId: group.id,
    });

    expect(result.revenueContractedCents).toBe(1000000); // só a confirmada
    expect(result.receivedCents).toBe(400000);
    expect(result.expenseTotalCents).toBe(600000);
    expect(result.paidToSuppliersCents).toBe(250000);
    expect(result.grossMarginCents).toBe(400000); // 1000000 - 600000
    expect(result.marginPercent).toBe(40);
    expect(result.supplierOutstandingCents).toBe(350000); // 600000 - 250000
  });

  it('grupo inexistente é recusado', async () => {
    const suppliers = fakeSupplierRepository();
    const schedule = fakeScheduleRepository();
    const bookings = fakeBookingRepository();
    const payments = fakePaymentRepository(bookings.rows);
    await expect(
      getGroupResult({ schedule, bookings, payments, suppliers }, ctx, { groupId: 'nao-existe' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

/**
 * SEC-01 · A01 — o fornecedor é assunto da equipe, e o dinheiro que sai dele mais ainda.
 *
 * A RLS da tabela é só-equipe, mas **não protege esta via**: o role do Prisma tem
 * `BYPASSRLS` e a Client Extension injeta apenas `tenantId`, nunca audiência. Quem barra
 * o cliente é o caso de uso — e sete deles não barravam. O PRD é explícito (§4 e §10.3):
 * "cliente nunca lê `supplier_expenses`, `supplier_payments`, margem".
 */
/**
 * FO-07 — a chave PIX do fornecedor. O tipo é descoberto pelo domínio (`parsePixKey`); o
 * caso de uso só decide o que fazer com chave ausente e com chave inválida.
 */
describe('FO-07: chave PIX do fornecedor', () => {
  it('guarda a chave normalizada e o tipo descoberto', async () => {
    const suppliers = fakeSupplierRepository();

    const forn = await createSupplier({ suppliers }, ctx, {
      name: 'Pousada',
      pixKey: '  Contato@Pousada.COM.br ',
    });

    expect(forn.pixKey).toBe('contato@pousada.com.br');
    expect(forn.pixKeyType).toBe('email');
  });

  it('fornecedor sem PIX é normal — recebe por boleto ou dinheiro', async () => {
    const suppliers = fakeSupplierRepository();

    const forn = await createSupplier({ suppliers }, ctx, { name: 'Sem chave' });

    expect(forn.pixKey).toBeNull();
    expect(forn.pixKeyType).toBeNull();
  });

  it('chave inválida é recusada no cadastro', async () => {
    const suppliers = fakeSupplierRepository();

    await expect(
      createSupplier({ suppliers }, ctx, { name: 'Pousada', pixKey: 'a chave da pousada' }),
    ).rejects.toBeInstanceOf(InvalidPixKeyError);
  });

  it('a edição troca a chave e o tipo junto', async () => {
    const suppliers = fakeSupplierRepository();
    const forn = await createSupplier({ suppliers }, ctx, {
      name: 'Pousada',
      pixKey: 'contato@pousada.com.br',
    });

    const editado = await updateSupplier({ suppliers }, ctx, {
      id: forn.id,
      pixKey: '(48) 99999-8877',
    });

    expect(editado.pixKey).toBe('5548999998877');
    expect(editado.pixKeyType).toBe('phone');
  });

  it('mandar null limpa a chave e o tipo', async () => {
    const suppliers = fakeSupplierRepository();
    const forn = await createSupplier({ suppliers }, ctx, {
      name: 'Pousada',
      pixKey: 'contato@pousada.com.br',
    });

    const editado = await updateSupplier({ suppliers }, ctx, { id: forn.id, pixKey: null });

    expect(editado.pixKey).toBeNull();
    expect(editado.pixKeyType).toBeNull();
  });

  it('não mandar o campo preserva a chave que estava lá', async () => {
    const suppliers = fakeSupplierRepository();
    const forn = await createSupplier({ suppliers }, ctx, {
      name: 'Pousada',
      pixKey: 'contato@pousada.com.br',
    });

    const editado = await updateSupplier({ suppliers }, ctx, { id: forn.id, name: 'Pousada II' });

    expect(editado.pixKey).toBe('contato@pousada.com.br');
    expect(editado.pixKeyType).toBe('email');
  });
});

describe('SEC-01: fornecedor e gasto são da equipe', () => {
  const cliente: RequestContext = {
    tenantId: 'tenant-a',
    actor: { kind: 'customer', customerId: 'c1', userId: 'u9' },
  };

  it('cliente não lê o resultado do grupo — é a margem da empresa', async () => {
    const suppliers = fakeSupplierRepository();
    const schedule = fakeScheduleRepository();
    const bookings = fakeBookingRepository();
    const payments = fakePaymentRepository(bookings.rows);
    const group = await seedGroup(schedule);

    await expect(
      getGroupResult({ schedule, bookings, payments, suppliers }, cliente, { groupId: group.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não lê os gastos do grupo', async () => {
    const suppliers = fakeSupplierRepository();
    const schedule = fakeScheduleRepository();
    const group = await seedGroup(schedule);

    await expect(
      listGroupExpenses({ suppliers, schedule }, cliente, { groupId: group.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não lança gasto', async () => {
    const suppliers = fakeSupplierRepository();
    const schedule = fakeScheduleRepository();
    const group = await seedGroup(schedule);
    const forn = await createSupplier({ suppliers }, ctx, { name: 'Pousada' });

    await expect(
      addSupplierExpense({ suppliers, schedule }, cliente, {
        groupId: group.id,
        supplierId: forn.id,
        description: 'Hospedagem',
        totalCents: 100000,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não cadastra nem edita fornecedor', async () => {
    const suppliers = fakeSupplierRepository();
    const forn = await createSupplier({ suppliers }, ctx, { name: 'Pousada' });

    await expect(
      createSupplier({ suppliers }, cliente, { name: 'Fantasma' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateSupplier({ suppliers }, cliente, { id: forn.id, name: 'Outro' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não lê nem cria categoria — conheceria a operação da casa', async () => {
    const suppliers = fakeSupplierRepository();

    await expect(listSupplierCategories({ suppliers }, cliente)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      createSupplierCategory({ suppliers, audit }, cliente, { name: 'Hospedagem' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  /**
   * Operator cria categoria de propósito: é ele quem cadastra fornecedor, e o
   * "+ Nova categoria…" do formulário é o mesmo gesto. O que exige owner/admin é
   * renomear e excluir (FO-05), que mexem no passado do relatório.
   */
  it('operator cria categoria — é o gesto do cadastro de fornecedor', async () => {
    const suppliers = fakeSupplierRepository();
    const operator: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'team', userId: 'u2', role: 'operator' },
    };

    await expect(
      createSupplierCategory({ suppliers, audit }, operator, { name: 'Hospedagem' }),
    ).resolves.toMatchObject({ name: 'Hospedagem' });
  });
});

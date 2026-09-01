import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '@expedition/domain';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakePaymentRepository } from '../payments/paymentRepository.fake.js';
import { fakeSupplierRepository } from '../suppliers/supplierRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { createSupplier } from '../suppliers/createSupplier.js';
import { updateSupplier } from '../suppliers/updateSupplier.js';
import { createSupplierCategory } from '../suppliers/createSupplierCategory.js';
import { addSupplierExpense } from '../suppliers/addSupplierExpense.js';
import { registerSupplierPayment } from '../suppliers/registerSupplierPayment.js';
import { getFinancialReport } from './getFinancialReport.js';
import { getExpensesByCategory } from './getExpensesByCategory.js';
import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';

/**
 * FO-06 — gastos por categoria de fornecedor.
 *
 * A categoria é do **fornecedor** e o gasto a herda na leitura (decisão do dono): trocar a
 * categoria de um fornecedor reclassifica o histórico dele inteiro. É o que faz "arrumei o
 * cadastro" consertar o relatório de uma vez, e é testado explicitamente aqui.
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

function deps() {
  const schedule = fakeScheduleRepository();
  const bookings = fakeBookingRepository();
  const payments = fakePaymentRepository(bookings.rows);
  const suppliers = fakeSupplierRepository();
  const audit = fakeAuditLogRepository();
  return { schedule, bookings, payments, suppliers, audit };
}

async function seedGroup(
  schedule: ReturnType<typeof fakeScheduleRepository>,
  name: string,
  start: string,
  end: string,
  itineraryId = 'itin-1',
) {
  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: ctx.tenantId,
      itineraryId,
      startDate: parseLocalDate(start),
      endDate: parseLocalDate(end),
      title: null,
      notes: null,
      status: 'scheduled',
    },
    {
      name,
      status: 'open',
      capacityVehicles: null,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );
  return group;
}

/** Fornecedor com categoria (ou sem, quando `categoria` vem nulo) e um gasto no grupo. */
async function gasto(
  d: ReturnType<typeof deps>,
  groupId: string,
  nome: string,
  categoryId: string | null,
  totalCents: number,
) {
  const forn = await createSupplier({ suppliers: d.suppliers }, ctx, {
    name: nome,
    ...(categoryId === null ? {} : { categoryId }),
  });
  return addSupplierExpense({ suppliers: d.suppliers, schedule: d.schedule }, ctx, {
    groupId,
    supplierId: forn.id,
    description: nome,
    totalCents,
  });
}

describe('FO-06: soma dos gastos por categoria', () => {
  it('dois fornecedores da mesma categoria caem numa linha só', async () => {
    const d = deps();
    const g = await seedGroup(d.schedule, 'Coxilha', '2026-03-10', '2026-03-12');
    const hosp = await createSupplierCategory({ suppliers: d.suppliers, audit: d.audit }, ctx, {
      name: 'Hospedagem',
    });
    await gasto(d, g.id, 'Pousada A', hosp.id, 200000);
    await gasto(d, g.id, 'Pousada B', hosp.id, 100000);

    const view = await getExpensesByCategory(d, ctx, {});

    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({
      categoryName: 'Hospedagem',
      contractedCents: 300000,
      supplierCount: 2,
      expenseCount: 2,
    });
  });

  it('o pago vem da soma dos pagamentos, e o em aberto é derivado', async () => {
    const d = deps();
    const g = await seedGroup(d.schedule, 'Coxilha', '2026-03-10', '2026-03-12');
    const cat = await createSupplierCategory({ suppliers: d.suppliers, audit: d.audit }, ctx, {
      name: 'Alimentação',
    });
    const expense = await gasto(d, g.id, 'Queijo e Cia', cat.id, 100000);
    await registerSupplierPayment({ suppliers: d.suppliers }, ctx, {
      expenseId: expense.id,
      amountCents: 40000,
      method: 'pix',
      paidAt: '2026-03-11',
    });

    const view = await getExpensesByCategory(d, ctx, {});

    expect(view.rows[0]).toMatchObject({
      contractedCents: 100000,
      paidCents: 40000,
      outstandingCents: 60000,
    });
  });

  /** Gasto que não aparece é pior que gasto mal classificado. */
  it('fornecedor sem categoria vira a linha "Sem categoria"', async () => {
    const d = deps();
    const g = await seedGroup(d.schedule, 'Coxilha', '2026-03-10', '2026-03-12');
    await gasto(d, g.id, 'Avulso', null, 50000);

    const view = await getExpensesByCategory(d, ctx, {});

    expect(view.rows[0]).toMatchObject({
      categoryId: null,
      categoryName: 'Sem categoria',
      contractedCents: 50000,
    });
  });

  it('ordena do maior gasto para o menor, com "Sem categoria" sempre por último', async () => {
    const d = deps();
    const g = await seedGroup(d.schedule, 'Coxilha', '2026-03-10', '2026-03-12');
    const a = await createSupplierCategory({ suppliers: d.suppliers, audit: d.audit }, ctx, {
      name: 'Pequena',
    });
    const b = await createSupplierCategory({ suppliers: d.suppliers, audit: d.audit }, ctx, {
      name: 'Grande',
    });
    await gasto(d, g.id, 'F1', a.id, 10000);
    await gasto(d, g.id, 'F2', b.id, 90000);
    await gasto(d, g.id, 'F3', null, 999999); // maior de todos, e ainda assim por último

    const view = await getExpensesByCategory(d, ctx, {});

    expect(view.rows.map((r) => r.categoryName)).toEqual(['Grande', 'Pequena', 'Sem categoria']);
  });

  it('sem gasto nenhum, devolve vazio com total zerado', async () => {
    const d = deps();
    await seedGroup(d.schedule, 'Coxilha', '2026-03-10', '2026-03-12');

    const view = await getExpensesByCategory(d, ctx, {});

    expect(view.rows).toEqual([]);
    expect(view.totals.contractedCents).toBe(0);
  });
});

describe('FO-06: a janela é a mesma do fechamento por saída', () => {
  it('o total de gastos bate com o do relatório financeiro no mesmo filtro', async () => {
    const d = deps();
    const dentro = await seedGroup(d.schedule, 'Dentro', '2026-03-10', '2026-03-12');
    const fora = await seedGroup(d.schedule, 'Fora', '2026-07-01', '2026-07-03');
    const cat = await createSupplierCategory({ suppliers: d.suppliers, audit: d.audit }, ctx, {
      name: 'Hospedagem',
    });
    await gasto(d, dentro.id, 'Pousada', cat.id, 200000);
    await gasto(d, dentro.id, 'Avulso', null, 50000);
    await gasto(d, fora.id, 'Outra saída', cat.id, 700000);

    const filtro = { from: parseLocalDate('2026-03-01'), to: parseLocalDate('2026-03-31') };
    const financeiro = await getFinancialReport(d, ctx, filtro);
    const porCategoria = await getExpensesByCategory(d, ctx, filtro);

    expect(porCategoria.totals.contractedCents).toBe(financeiro.totals.expenseCents);
    expect(porCategoria.totals.contractedCents).toBe(250000);
  });

  it('filtra por roteiro', async () => {
    const d = deps();
    const a = await seedGroup(d.schedule, 'A', '2026-03-10', '2026-03-12', 'itin-1');
    const b = await seedGroup(d.schedule, 'B', '2026-03-20', '2026-03-22', 'itin-2');
    const cat = await createSupplierCategory({ suppliers: d.suppliers, audit: d.audit }, ctx, {
      name: 'Hospedagem',
    });
    await gasto(d, a.id, 'Pousada A', cat.id, 100000);
    await gasto(d, b.id, 'Pousada B', cat.id, 900000);

    const view = await getExpensesByCategory(d, ctx, { itineraryId: 'itin-1' });

    expect(view.totals.contractedCents).toBe(100000);
  });
});

describe('FO-06: a categoria é do fornecedor', () => {
  /** A decisão do dono, virada teste: recategorizar reescreve o passado de propósito. */
  it('recategorizar o fornecedor move o gasto antigo de linha', async () => {
    const d = deps();
    const g = await seedGroup(d.schedule, 'Coxilha', '2026-03-10', '2026-03-12');
    const hosp = await createSupplierCategory({ suppliers: d.suppliers, audit: d.audit }, ctx, {
      name: 'Hospedagem',
    });
    const alim = await createSupplierCategory({ suppliers: d.suppliers, audit: d.audit }, ctx, {
      name: 'Alimentação',
    });
    const forn = await createSupplier({ suppliers: d.suppliers }, ctx, {
      name: 'Fazenda',
      categoryId: hosp.id,
    });
    await addSupplierExpense({ suppliers: d.suppliers, schedule: d.schedule }, ctx, {
      groupId: g.id,
      supplierId: forn.id,
      description: 'Pernoite',
      totalCents: 300000,
    });

    const antes = await getExpensesByCategory(d, ctx, {});
    expect(antes.rows[0]?.categoryName).toBe('Hospedagem');

    await updateSupplier({ suppliers: d.suppliers }, ctx, { id: forn.id, categoryId: alim.id });

    const depois = await getExpensesByCategory(d, ctx, {});
    expect(depois.rows[0]).toMatchObject({
      categoryName: 'Alimentação',
      contractedCents: 300000,
    });
    expect(depois.rows).toHaveLength(1);
  });

  /**
   * Fornecedor apagado sai de `listSuppliers`, mas o gasto dele continua no grupo. Cair em
   * "Sem categoria" mantém o total batendo com o financeiro; sumir quebraria a
   * reconciliação sem avisar.
   */
  it('gasto de fornecedor ausente da lista cai em "Sem categoria" e o total não muda', async () => {
    const d = deps();
    const g = await seedGroup(d.schedule, 'Coxilha', '2026-03-10', '2026-03-12');
    d.suppliers.expenses.push({
      id: 'exp-orfao',
      tenantId: ctx.tenantId,
      groupId: g.id,
      supplierId: 'fornecedor-que-sumiu',
      description: 'Serviço avulso',
      totalCents: 70000 as never,
    });

    const view = await getExpensesByCategory(d, ctx, {});

    expect(view.rows[0]).toMatchObject({ categoryId: null, contractedCents: 70000 });
    expect(view.totals.contractedCents).toBe(70000);
  });
});

describe('FO-06: quem lê', () => {
  it('cliente não vê o relatório — é gasto e margem da empresa', async () => {
    const d = deps();

    await expect(
      getExpensesByCategory(
        d,
        { ...ctx, actor: { kind: 'customer', customerId: 'c1', userId: 'u9' } },
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

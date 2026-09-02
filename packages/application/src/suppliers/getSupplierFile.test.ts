import { describe, expect, it } from 'vitest';
import { cents, parseLocalDate } from '@expedition/domain';
import { fakeSupplierRepository } from './supplierRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { getSupplierFile } from './getSupplierFile.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

async function seed() {
  const suppliers = fakeSupplierRepository();
  const schedule = fakeScheduleRepository();

  const supplier = await suppliers.createSupplier({
    tenantId: ctx.tenantId,
    name: 'Pousada do Vale',
    doc: '12345678000199',
    docType: 'cnpj',
    phone: '4833334444',
    email: 'contato@pousada.com',
    pixKey: null,
    pixKeyType: null,
    notes: null,
    categoryId: null,
  });

  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: ctx.tenantId,
      itineraryId: 'itin-1',
      startDate: parseLocalDate('2025-12-01'),
      endDate: parseLocalDate('2025-12-05'),
      title: null,
      notes: null,
      status: 'scheduled',
    },
    {
      name: 'Vale Europeu · 01/12/2025',
      status: 'open',
      capacityVehicles: 8,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );

  return { suppliers, schedule, supplier, group };
}

describe('FO-03: ficha do fornecedor (saídas, pagamentos, totais)', () => {
  it('agrega saídas com contratado/pago/em aberto e o extrato de pagamentos', async () => {
    const { suppliers, schedule, supplier, group } = await seed();
    const expense = await suppliers.addExpense({
      tenantId: ctx.tenantId,
      groupId: group.id,
      supplierId: supplier.id,
      description: 'Hospedagem',
      totalCents: cents(300000),
    });
    await suppliers.addPayment({
      tenantId: ctx.tenantId,
      supplierExpenseId: expense.id,
      paidAt: parseLocalDate('2025-11-20'),
      amountCents: cents(100000),
      method: 'pix',
      reference: null,
      notes: null,
      createdBy: null,
    });

    const file = await getSupplierFile({ suppliers, schedule }, ctx, { supplierId: supplier.id });

    expect(file.supplier.name).toBe('Pousada do Vale');
    expect(file.saidas).toHaveLength(1);
    const saida = file.saidas[0]!;
    expect(saida.groupName).toBe('Vale Europeu · 01/12/2025');
    expect(saida.contractedCents).toBe(300000);
    expect(saida.paidCents).toBe(100000);
    expect(saida.outstandingCents).toBe(200000);

    expect(file.pagamentos).toHaveLength(1);
    expect(file.pagamentos[0]!.method).toBe('pix');
    expect(file.pagamentos[0]!.groupName).toBe('Vale Europeu · 01/12/2025');

    expect(file.totals.contractedCents).toBe(300000);
    expect(file.totals.paidCents).toBe(100000);
    expect(file.totals.outstandingCents).toBe(200000);
  });

  it('soma várias despesas da mesma saída num total por grupo', async () => {
    const { suppliers, schedule, supplier, group } = await seed();
    await suppliers.addExpense({
      tenantId: ctx.tenantId,
      groupId: group.id,
      supplierId: supplier.id,
      description: 'Hospedagem',
      totalCents: cents(300000),
    });
    await suppliers.addExpense({
      tenantId: ctx.tenantId,
      groupId: group.id,
      supplierId: supplier.id,
      description: 'Alimentação',
      totalCents: cents(80000),
    });

    const file = await getSupplierFile({ suppliers, schedule }, ctx, { supplierId: supplier.id });
    expect(file.saidas).toHaveLength(1);
    expect(file.saidas[0]!.contractedCents).toBe(380000);
    expect(file.totals.outstandingCents).toBe(380000);
  });

  it('fornecedor inexistente é recusado', async () => {
    const { suppliers, schedule } = await seed();
    await expect(
      getSupplierFile({ suppliers, schedule }, ctx, { supplierId: 'nao-existe' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('FO-03 é da equipe: contexto de cliente é recusado', async () => {
    const { suppliers, schedule, supplier } = await seed();
    const customerCtx: RequestContext = {
      tenantId: ctx.tenantId,
      actor: { kind: 'customer', customerId: 'c1', userId: 'u1' },
    };
    await expect(
      getSupplierFile({ suppliers, schedule }, customerCtx, { supplierId: supplier.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

import { describe, expect, it } from 'vitest';
import { cents, parseLocalDate } from '@expedition/domain';
import { fakeSupplierRepository } from './supplierRepository.fake.js';
import { listGroupExpenses } from './listGroupExpenses.js';
import type { RequestContext } from '../context.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

describe('GR-08/GR-09: despesas do grupo com pago e em aberto derivados', () => {
  it('lista cada despesa com nome do fornecedor, total, pago (SOMA) e em aberto', async () => {
    const suppliers = fakeSupplierRepository();
    const sup = await suppliers.createSupplier({
      tenantId: ctx.tenantId,
      name: 'Pousada do Vale',
      doc: null,
      docType: null,
      phone: null,
      email: null,
      pixKey: null,
      pixKeyType: null,
      notes: null,
      categoryId: null,
    });
    const expense = await suppliers.addExpense({
      tenantId: ctx.tenantId,
      groupId: 'grp-1',
      supplierId: sup.id,
      description: 'Hospedagem',
      totalCents: cents(300000),
    });
    await suppliers.addPayment({
      tenantId: ctx.tenantId,
      supplierExpenseId: expense.id,
      paidAt: parseLocalDate('2025-10-01'),
      amountCents: cents(100000),
      method: 'pix',
      reference: null,
      notes: null,
      createdBy: null,
    });

    const rows = await listGroupExpenses({ suppliers }, ctx, { groupId: 'grp-1' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.supplierName).toBe('Pousada do Vale');
    expect(rows[0]!.totalCents).toBe(300000);
    expect(rows[0]!.paidCents).toBe(100000);
    expect(rows[0]!.outstandingCents).toBe(200000);
  });

  it('grupo sem despesas devolve lista vazia', async () => {
    const suppliers = fakeSupplierRepository();
    const rows = await listGroupExpenses({ suppliers }, ctx, { groupId: 'grp-vazio' });
    expect(rows).toEqual([]);
  });
});

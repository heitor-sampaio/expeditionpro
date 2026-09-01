import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '@expedition/domain';
import { fakeSupplierRepository } from './supplierRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { createSupplier } from './createSupplier.js';
import { addSupplierExpense } from './addSupplierExpense.js';
import { registerSupplierPayment } from './registerSupplierPayment.js';
import { listGroupExpenses } from './listGroupExpenses.js';
import { deleteSupplierExpense } from './deleteSupplierExpense.js';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

/**
 * GR-18 — excluir um gasto lançado errado.
 *
 * Exclusão **lógica**: o registro sai das leituras mas fica na tabela, porque é lançamento
 * financeiro e o `CLAUDE.md` é explícito — registro que teve dinheiro associado não se
 * apaga.
 *
 * E **gasto já pago não se exclui**: `listPaymentsByGroup` casa pagamento com o grupo, não
 * com o gasto vivo, então apagar o gasto deixaria os pagamentos contando como "pago aos
 * fornecedores" sem contratado por trás — margem errada, e sem nada na tela dizendo por
 * quê. Quem pagou errado corrige por acerto, não apagando a obrigação.
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
const operator: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u2', role: 'operator' },
};

async function setup() {
  const suppliers = fakeSupplierRepository();
  const schedule = fakeScheduleRepository();
  const audit = fakeAuditLogRepository();
  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: ctx.tenantId,
      itineraryId: 'itin-1',
      startDate: parseLocalDate('2026-03-10'),
      endDate: parseLocalDate('2026-03-12'),
      title: null,
      notes: null,
      status: 'scheduled',
    },
    {
      name: 'Coxilha',
      status: 'open',
      capacityVehicles: null,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );
  const supplier = await createSupplier({ suppliers }, ctx, { name: 'Pousada' });
  const expense = await addSupplierExpense(
    { suppliers, schedule, audit: fakeAuditLogRepository() },
    ctx,
    {
      groupId: group.id,
      supplierId: supplier.id,
      description: 'Hospedagem',
      totalCents: 200000,
    },
  );
  return { suppliers, schedule, audit, group, expense, deps: { suppliers, audit } };
}

describe('GR-18: excluir gasto', () => {
  it('o gasto some da tabela do grupo', async () => {
    const s = await setup();

    await deleteSupplierExpense(s.deps, ctx, { expenseId: s.expense.id });

    const rows = await listGroupExpenses(
      { suppliers: s.suppliers, audit: fakeAuditLogRepository() },
      ctx,
      { groupId: s.group.id },
    );
    expect(rows).toEqual([]);
  });

  /** Exclusão lógica: o lançamento sai da leitura, não da tabela. */
  it('a linha continua guardada, só marcada como excluída', async () => {
    const s = await setup();

    await deleteSupplierExpense(s.deps, ctx, { expenseId: s.expense.id });

    expect(s.suppliers.expenses.some((e) => e.id === s.expense.id)).toBe(true);
    expect(s.suppliers.deletedExpenses.has(s.expense.id)).toBe(true);
  });

  it('some também da busca por id — nenhuma leitura enxerga gasto excluído', async () => {
    const s = await setup();

    await deleteSupplierExpense(s.deps, ctx, { expenseId: s.expense.id });

    await expect(s.suppliers.findExpenseById(ctx.tenantId, s.expense.id)).resolves.toBeNull();
  });

  it('gasto com pagamento lançado é recusado', async () => {
    const s = await setup();
    await registerSupplierPayment(
      { suppliers: s.suppliers, audit: fakeAuditLogRepository() },
      ctx,
      {
        expenseId: s.expense.id,
        amountCents: 50000,
        method: 'pix',
        paidAt: '2026-03-11',
      },
    );

    const erro = await deleteSupplierExpense(s.deps, ctx, { expenseId: s.expense.id }).catch(
      (e: unknown) => e as BusinessRuleError,
    );

    expect(erro).toBeInstanceOf(BusinessRuleError);
    expect((erro as BusinessRuleError).code).toBe('expense_has_payments');
  });

  it('gasto de outro tenant não é encontrado', async () => {
    const s = await setup();
    const outro: RequestContext = {
      tenantId: 'tenant-b',
      actor: { kind: 'team', userId: 'u3', role: 'admin' },
    };

    await expect(
      deleteSupplierExpense(s.deps, outro, { expenseId: s.expense.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('gasto inexistente', async () => {
    const s = await setup();

    await expect(
      deleteSupplierExpense(s.deps, ctx, { expenseId: 'nao-existe' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('excluir duas vezes não passa na segunda', async () => {
    const s = await setup();
    await deleteSupplierExpense(s.deps, ctx, { expenseId: s.expense.id });

    await expect(
      deleteSupplierExpense(s.deps, ctx, { expenseId: s.expense.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  /** Excluir gasto é ato financeiro, do mesmo peso de excluir recebimento (IN-09). */
  it('operator não exclui', async () => {
    const s = await setup();

    await expect(
      deleteSupplierExpense(s.deps, operator, { expenseId: s.expense.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não exclui', async () => {
    const s = await setup();

    await expect(
      deleteSupplierExpense(
        s.deps,
        { ...ctx, actor: { kind: 'customer', customerId: 'c1', userId: 'u9' } },
        { expenseId: s.expense.id },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a trilha registra o quanto e de quem era o gasto', async () => {
    const s = await setup();

    await deleteSupplierExpense(s.deps, ctx, { expenseId: s.expense.id });

    const entry = s.audit.rows.find((row) => row.action === 'supplier_expense.delete');
    expect(entry).toMatchObject({ entity: 'supplier_expense', entityId: s.expense.id });
    expect(entry?.diff).toMatchObject({
      groupId: s.group.id,
      description: 'Hospedagem',
      totalCents: 200000,
    });
  });
});

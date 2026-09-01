import { subCents, sumCents, zeroCents, type Cents, type LocalDate } from '@expedition/domain';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { SupplierRecord, SupplierRepository } from './supplierRepository.js';

/**
 * FO-03 — a ficha do fornecedor. Três abas: as **saídas** em que prestou serviço (com
 * contratado, pago e em aberto por grupo), o **extrato de pagamentos** e os **dados
 * fiscais**. Pago é sempre SOMA de `supplier_payments`, nunca coluna; o saldo é
 * derivado. Leitura de back-office: só a equipe alcança.
 */

export interface GetSupplierFileDeps {
  readonly suppliers: SupplierRepository;
  readonly schedule: ScheduleRepository;
}

export interface GetSupplierFileCommand {
  readonly supplierId: string;
}

export interface SupplierFileHeader {
  readonly id: string;
  readonly name: string;
  readonly doc: string | null;
  readonly docType: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly notes: string | null;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
}

export interface SupplierFileSaida {
  readonly groupId: string;
  readonly groupName: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly contractedCents: number;
  readonly paidCents: number;
  readonly outstandingCents: number;
}

export interface SupplierFilePayment {
  readonly id: string;
  readonly paidAt: LocalDate;
  readonly amountCents: number;
  readonly method: string;
  readonly expenseDescription: string;
  readonly groupName: string;
}

export interface SupplierFileTotals {
  readonly contractedCents: number;
  readonly paidCents: number;
  readonly outstandingCents: number;
}

export interface SupplierFile {
  readonly supplier: SupplierFileHeader;
  readonly saidas: readonly SupplierFileSaida[];
  readonly pagamentos: readonly SupplierFilePayment[];
  readonly totals: SupplierFileTotals;
}

export async function getSupplierFile(
  deps: GetSupplierFileDeps,
  ctx: RequestContext,
  command: GetSupplierFileCommand,
): Promise<SupplierFile> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('A ficha do fornecedor é da equipe');
  }

  const supplier = await deps.suppliers.findSupplierById(ctx.tenantId, command.supplierId);
  if (!supplier) {
    throw new NotFoundError('fornecedor');
  }

  const expenses = await deps.suppliers.listExpensesBySupplier(ctx.tenantId, command.supplierId);
  const payments = await deps.suppliers.listPaymentsBySupplier(ctx.tenantId, command.supplierId);

  const paidByExpense = new Map<string, Cents>();
  for (const expense of expenses) {
    const amounts = payments
      .filter((payment) => payment.supplierExpenseId === expense.id)
      .map((payment) => payment.amountCents);
    paidByExpense.set(expense.id, amounts.length === 0 ? zeroCents : sumCents(amounts));
  }

  const groupIds = [...new Set(expenses.map((expense) => expense.groupId))];
  const groupById = new Map<string, { name: string; start: LocalDate; end: LocalDate }>();
  await Promise.all(
    groupIds.map(async (groupId) => {
      const context = await deps.schedule.findGroupById(ctx.tenantId, groupId);
      if (context) {
        groupById.set(groupId, {
          name: context.group.name,
          start: context.event.startDate,
          end: context.event.endDate,
        });
      }
    }),
  );

  const saidas = groupIds
    .map((groupId) => toSaida(groupId, expenses, paidByExpense, groupById))
    .filter((saida): saida is SupplierFileSaida => saida !== null);

  const descriptionByExpense = new Map(expenses.map((e) => [e.id, e.description]));
  const groupByExpense = new Map(expenses.map((e) => [e.id, e.groupId]));
  const pagamentos: SupplierFilePayment[] = payments.map((payment) => ({
    id: payment.id,
    paidAt: payment.paidAt,
    amountCents: payment.amountCents,
    method: payment.method,
    expenseDescription: descriptionByExpense.get(payment.supplierExpenseId) ?? '—',
    groupName: groupById.get(groupByExpense.get(payment.supplierExpenseId) ?? '')?.name ?? '—',
  }));

  const contracted = sumCents(expenses.map((expense) => expense.totalCents));
  const paid = sumCents(payments.map((payment) => payment.amountCents));

  return {
    supplier: toHeader(supplier),
    saidas,
    pagamentos,
    totals: {
      contractedCents: contracted,
      paidCents: paid,
      outstandingCents: subCents(contracted, paid),
    },
  };
}

function toSaida(
  groupId: string,
  expenses: Awaited<ReturnType<SupplierRepository['listExpensesBySupplier']>>,
  paidByExpense: Map<string, Cents>,
  groupById: Map<string, { name: string; start: LocalDate; end: LocalDate }>,
): SupplierFileSaida | null {
  const group = groupById.get(groupId);
  if (!group) {
    return null;
  }
  const groupExpenses = expenses.filter((expense) => expense.groupId === groupId);
  const contracted = sumCents(groupExpenses.map((expense) => expense.totalCents));
  const paid = sumCents(groupExpenses.map((expense) => paidByExpense.get(expense.id) ?? zeroCents));
  return {
    groupId,
    groupName: group.name,
    startDate: group.start,
    endDate: group.end,
    contractedCents: contracted,
    paidCents: paid,
    outstandingCents: subCents(contracted, paid),
  };
}

function toHeader(supplier: SupplierRecord): SupplierFileHeader {
  return {
    id: supplier.id,
    name: supplier.name,
    doc: supplier.doc,
    docType: supplier.docType,
    phone: supplier.phone,
    email: supplier.email,
    notes: supplier.notes,
    categoryId: supplier.categoryId,
    categoryName: supplier.categoryName,
  };
}

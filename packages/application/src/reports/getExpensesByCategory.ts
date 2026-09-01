import { cents, subCents, sumCents, zeroCents } from '@expedition/domain';
import { ForbiddenError } from '../errors.js';
import { withinReportWindow } from './reportWindow.js';
import type { Cents } from '@expedition/domain';
import type { ReportWindow } from './reportWindow.js';
import type { RequestContext } from '../context.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { SupplierRepository } from '../suppliers/supplierRepository.js';

/**
 * FO-06 — quanto a casa gasta por tipo de serviço.
 *
 * Uma linha por categoria de fornecedor: contratado, pago e em aberto, na mesma janela do
 * fechamento por saída (`withinReportWindow`). Os dois relatórios somam **o mesmo total de
 * gastos** por construção — é o que permite ler um ao lado do outro.
 *
 * **A categoria é do fornecedor**, resolvida na leitura. Recategorizar reclassifica o
 * histórico dele inteiro, de propósito: quando alguém arruma o cadastro, quer que o
 * relatório fique certo do começo, não dali para a frente. É a mesma razão pela qual
 * excluir categoria em uso é bloqueado (FO-05) — aquilo seria a mesma reescrita, mas em
 * silêncio.
 *
 * Contraste com o preço da inscrição (§3.4), que é congelado: lá o número **é** o contrato
 * com o cliente e não pode mudar; aqui a categoria é só a gaveta em que a casa guarda o
 * gasto para se olhar.
 */

export interface GetExpensesByCategoryDeps {
  readonly schedule: ScheduleRepository;
  readonly suppliers: SupplierRepository;
}

export interface ExpensesByCategoryRow {
  /** `null` = fornecedor sem categoria, ou fornecedor que sumiu do cadastro. */
  readonly categoryId: string | null;
  readonly categoryName: string;
  readonly contractedCents: number;
  readonly paidCents: number;
  readonly outstandingCents: number;
  readonly supplierCount: number;
  readonly expenseCount: number;
}

export interface ExpensesByCategoryTotals {
  readonly contractedCents: number;
  readonly paidCents: number;
  readonly outstandingCents: number;
  readonly expenseCount: number;
}

export interface ExpensesByCategoryView {
  readonly rows: readonly ExpensesByCategoryRow[];
  readonly totals: ExpensesByCategoryTotals;
}

const SEM_CATEGORIA = 'Sem categoria';

/** O balde de uma categoria enquanto a soma acontece. */
interface Bucket {
  categoryId: string | null;
  categoryName: string;
  contracted: Cents[];
  paid: Cents[];
  suppliers: Set<string>;
  expenseCount: number;
}

export async function getExpensesByCategory(
  deps: GetExpensesByCategoryDeps,
  ctx: RequestContext,
  filter: ReportWindow = {},
): Promise<ExpensesByCategoryView> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('Relatório de gastos é da equipe');
  }

  // Uma leitura só de fornecedores, fora do laço: a categoria de cada gasto sai daqui.
  const categoryOf = new Map(
    (await deps.suppliers.listSuppliers(ctx.tenantId)).map((supplier) => [
      supplier.id,
      { id: supplier.categoryId, name: supplier.categoryName },
    ]),
  );

  const events = (await deps.schedule.listEvents(ctx.tenantId)).filter(({ event, group }) =>
    withinReportWindow(event.startDate, group.itineraryId, filter),
  );

  const buckets = new Map<string, Bucket>();
  for (const { group } of events) {
    const expenses = await deps.suppliers.listExpensesByGroup(ctx.tenantId, group.id);
    const payments = await deps.suppliers.listPaymentsByGroup(ctx.tenantId, group.id);

    for (const expense of expenses) {
      const category = categoryOf.get(expense.supplierId);
      const bucket = bucketFor(buckets, category?.id ?? null, category?.name ?? null);

      bucket.contracted.push(expense.totalCents);
      bucket.suppliers.add(expense.supplierId);
      bucket.expenseCount += 1;
      for (const payment of payments) {
        if (payment.supplierExpenseId === expense.id) bucket.paid.push(payment.amountCents);
      }
    }
  }

  const rows = [...buckets.values()].map(toRow).sort(maiorGastoPrimeiro);
  return { rows, totals: totalize(rows) };
}

function bucketFor(
  buckets: Map<string, Bucket>,
  categoryId: string | null,
  categoryName: string | null,
): Bucket {
  const key = categoryId ?? '';
  const found = buckets.get(key);
  if (found) return found;

  const bucket: Bucket = {
    categoryId,
    categoryName: categoryName ?? SEM_CATEGORIA,
    contracted: [],
    paid: [],
    suppliers: new Set(),
    expenseCount: 0,
  };
  buckets.set(key, bucket);
  return bucket;
}

function toRow(bucket: Bucket): ExpensesByCategoryRow {
  const contracted = somaOuZero(bucket.contracted);
  const paid = somaOuZero(bucket.paid);
  return {
    categoryId: bucket.categoryId,
    categoryName: bucket.categoryName,
    contractedCents: Number(contracted),
    paidCents: Number(paid),
    outstandingCents: Number(subCents(contracted, paid)),
    supplierCount: bucket.suppliers.size,
    expenseCount: bucket.expenseCount,
  };
}

/**
 * Maior gasto primeiro — o relatório existe para achar onde o dinheiro vai. "Sem
 * categoria" fica sempre no fim, por maior que seja: é um lembrete de cadastro por fazer,
 * não uma categoria disputando o topo.
 */
function maiorGastoPrimeiro(a: ExpensesByCategoryRow, b: ExpensesByCategoryRow): number {
  if (a.categoryId === null) return 1;
  if (b.categoryId === null) return -1;
  return b.contractedCents - a.contractedCents;
}

function totalize(rows: readonly ExpensesByCategoryRow[]): ExpensesByCategoryTotals {
  const contracted = somaOuZero(rows.map((r) => cents(r.contractedCents)));
  const paid = somaOuZero(rows.map((r) => cents(r.paidCents)));
  return {
    contractedCents: Number(contracted),
    paidCents: Number(paid),
    outstandingCents: Number(subCents(contracted, paid)),
    expenseCount: rows.reduce((total, row) => total + row.expenseCount, 0),
  };
}

function somaOuZero(values: readonly Cents[]): Cents {
  return values.length === 0 ? zeroCents : sumCents(values);
}

import {
  cents,
  computeGroupResult,
  compareLocalDate,
  subCents,
  sumCents,
} from '@expedition/domain';
import { ForbiddenError } from '../errors.js';
import { withinReportWindow } from './reportWindow.js';
import type { Cents, LocalDate } from '@expedition/domain';
import type { ReportWindow } from './reportWindow.js';
import type { RequestContext } from '../context.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { PaymentRepository } from '../payments/paymentRepository.js';
import type { SupplierRepository } from '../suppliers/supplierRepository.js';

/**
 * Fechamento por saída, consolidado (estende GR-10 para a carteira). Uma linha por grupo:
 * receita = contratado das inscrições **confirmadas** (pendente não é venda), gastos =
 * contratado com fornecedores, margem = receita − gastos, e a receber = receita − recebido.
 * Totais do tenant no rodapé. Tudo derivado, nada em coluna. Dado financeiro → só a equipe.
 */

export interface GetFinancialReportDeps {
  readonly schedule: ScheduleRepository;
  readonly bookings: BookingRepository;
  readonly payments: PaymentRepository;
  readonly suppliers: SupplierRepository;
}

export interface FinancialReportRow {
  readonly groupId: string;
  readonly groupName: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly status: string;
  readonly revenueCents: number;
  readonly expenseCents: number;
  readonly grossMarginCents: number;
  readonly marginPercent: number | null;
  readonly receivedCents: number;
  readonly dueCents: number;
}

export interface FinancialReportTotals {
  readonly revenueCents: number;
  readonly expenseCents: number;
  readonly grossMarginCents: number;
  readonly marginPercent: number | null;
  readonly receivedCents: number;
  readonly dueCents: number;
}

export interface FinancialReportView {
  readonly rows: readonly FinancialReportRow[];
  readonly totals: FinancialReportTotals;
}

/**
 * Filtro opcional: janela por data de início da saída e/ou roteiro. É o mesmo tipo que o
 * relatório de gastos por categoria usa — os dois somam o mesmo total de gastos por
 * definição, e um filtro próprio para cada um quebraria isso em silêncio.
 */
export type FinancialReportFilter = ReportWindow;

export async function getFinancialReport(
  deps: GetFinancialReportDeps,
  ctx: RequestContext,
  filter: FinancialReportFilter = {},
): Promise<FinancialReportView> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('Relatório financeiro é da equipe');
  }

  const events = (await deps.schedule.listEvents(ctx.tenantId)).filter(({ event, group }) =>
    withinReportWindow(event.startDate, group.itineraryId, filter),
  );
  const rows: FinancialReportRow[] = [];
  for (const { event, group } of events) {
    rows.push(
      await computeRow(
        deps,
        ctx.tenantId,
        group.id,
        group.name,
        event.startDate,
        event.endDate,
        group.status,
      ),
    );
  }
  rows.sort((a, b) => compareLocalDate(a.startDate, b.startDate));

  return { rows, totals: totalize(rows) };
}

async function computeRow(
  deps: GetFinancialReportDeps,
  tenantId: string,
  groupId: string,
  groupName: string,
  startDate: LocalDate,
  endDate: LocalDate,
  status: string,
): Promise<FinancialReportRow> {
  const bookings = await deps.bookings.listByGroup(tenantId, groupId);
  const revenue = sumCents(
    bookings
      .filter((b) => b.status === 'confirmed')
      .map((b) => sumOrZero(b.participants.map((p) => p.unitPriceCents))),
  );
  const payments = await deps.payments.listByGroup(tenantId, groupId);
  const received = sumCents(payments.map((p) => p.amountCents));
  const expenses = await deps.suppliers.listExpensesByGroup(tenantId, groupId);
  const expense = sumCents(expenses.map((e) => e.totalCents));

  const result = computeGroupResult(revenue, expense);
  return {
    groupId,
    groupName,
    startDate,
    endDate,
    status,
    revenueCents: revenue,
    expenseCents: expense,
    grossMarginCents: result.grossMarginCents,
    marginPercent: result.marginPercent,
    receivedCents: received,
    dueCents: subCents(revenue, received),
  };
}

function totalize(rows: readonly FinancialReportRow[]): FinancialReportTotals {
  const revenue = sumCents(rows.map((r) => cents(r.revenueCents)));
  const expense = sumCents(rows.map((r) => cents(r.expenseCents)));
  const result = computeGroupResult(revenue, expense);
  return {
    revenueCents: revenue,
    expenseCents: expense,
    grossMarginCents: result.grossMarginCents,
    marginPercent: result.marginPercent,
    receivedCents: sumCents(rows.map((r) => cents(r.receivedCents))),
    dueCents: sumCents(rows.map((r) => cents(r.dueCents))),
  };
}

function sumOrZero(units: readonly Cents[]): Cents {
  return units.length === 0 ? cents(0) : sumCents(units);
}

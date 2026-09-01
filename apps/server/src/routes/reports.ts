import { getDashboard, getExpensesByCategory, getFinancialReport } from '@expedition/application';
import { parseLocalDate } from '@expedition/domain';
import { z } from 'zod';
import type {
  DashboardView,
  ExpensesByCategoryRow,
  ExpensesByCategoryView,
  ReportWindow,
  FinancialReportRow,
  FinancialReportView,
  UpcomingGroup,
} from '@expedition/application';
import type { LocalDate } from '@expedition/domain';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

/** A janela vale para os dois relatórios — é o que os faz somar o mesmo total de gastos. */
const windowQuery = z.object({
  from: DATE,
  to: DATE,
  itineraryId: z.string().min(1).optional(),
});

function windowOf(query: z.infer<typeof windowQuery>): ReportWindow {
  return {
    from: query.from ? parseLocalDate(query.from) : undefined,
    to: query.to ? parseLocalDate(query.to) : undefined,
    itineraryId: query.itineraryId,
  };
}

/**
 * Relatórios (back-office). Fechamento por saída consolidado: uma linha por grupo com
 * receita confirmada, gastos, margem e a receber, mais os totais do tenant. Filtro
 * opcional por janela de data e roteiro. Dado financeiro → só a equipe (guarda no caso de uso).
 */
export function registerReportRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/v1/reports/financial',
    {
      schema: { querystring: windowQuery },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const filter = windowOf(request.query);
      const report = await getFinancialReport(
        {
          schedule: deps.schedule,
          bookings: deps.bookings,
          payments: deps.payments,
          suppliers: deps.suppliers,
        },
        ctx,
        filter,
      );
      return reply.send(toDto(report));
    },
  );

  // FO-06 — gastos por categoria de fornecedor, na mesma janela do fechamento por saída.
  typed.get(
    '/v1/reports/expenses-by-category',
    { schema: { querystring: windowQuery } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const report = await getExpensesByCategory(
        { schedule: deps.schedule, suppliers: deps.suppliers },
        ctx,
        windowOf(request.query),
      );
      return reply.send(expensesByCategoryDto(report));
    },
  );

  typed.get('/v1/reports/dashboard', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const dashboard = await getDashboard(
      {
        schedule: deps.schedule,
        bookings: deps.bookings,
        payments: deps.payments,
        intake: deps.intake,
        clock: deps.clock ?? (() => new Date()),
      },
      ctx,
    );
    return reply.send(dashboardDto(dashboard));
  });
}

function dashboardDto(d: DashboardView) {
  return {
    confirmedRevenueCents: d.confirmedRevenueCents,
    projectedRevenueCents: d.projectedRevenueCents,
    receivedCents: d.receivedCents,
    dueCents: d.dueCents,
    pendingIntakeCount: d.pendingIntakeCount,
    pendingBookingCount: d.pendingBookingCount,
    upcoming: d.upcoming.map(upcomingDto),
  };
}

function upcomingDto(u: UpcomingGroup) {
  return {
    groupId: u.groupId,
    groupName: u.groupName,
    startDate: isoOf(u.startDate),
    endDate: isoOf(u.endDate),
    confirmedCount: u.confirmedCount,
    pendingCount: u.pendingCount,
    capacityVehicles: u.capacityVehicles,
  };
}

function toDto(report: FinancialReportView) {
  return {
    rows: report.rows.map(rowDto),
    totals: {
      revenueCents: report.totals.revenueCents,
      expenseCents: report.totals.expenseCents,
      grossMarginCents: report.totals.grossMarginCents,
      marginPercent: report.totals.marginPercent,
      receivedCents: report.totals.receivedCents,
      dueCents: report.totals.dueCents,
    },
  };
}

function rowDto(row: FinancialReportRow) {
  return {
    groupId: row.groupId,
    groupName: row.groupName,
    startDate: isoOf(row.startDate),
    endDate: isoOf(row.endDate),
    status: row.status,
    revenueCents: row.revenueCents,
    expenseCents: row.expenseCents,
    grossMarginCents: row.grossMarginCents,
    marginPercent: row.marginPercent,
    receivedCents: row.receivedCents,
    dueCents: row.dueCents,
  };
}

function isoOf(date: LocalDate): string {
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return `${date.year}-${mm}-${dd}`;
}

/** DTO explícito: nada de tenantId nem de id de fornecedor vazando no relatório. */
function expensesByCategoryDto(report: ExpensesByCategoryView) {
  return {
    rows: report.rows.map(expenseCategoryRowDto),
    totals: {
      contractedCents: report.totals.contractedCents,
      paidCents: report.totals.paidCents,
      outstandingCents: report.totals.outstandingCents,
      expenseCount: report.totals.expenseCount,
    },
  };
}

function expenseCategoryRowDto(row: ExpensesByCategoryRow) {
  return {
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    contractedCents: row.contractedCents,
    paidCents: row.paidCents,
    outstandingCents: row.outstandingCents,
    supplierCount: row.supplierCount,
    expenseCount: row.expenseCount,
  };
}

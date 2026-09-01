import { computeGroupResult, cents, subCents, sumCents, type Cents } from '@expedition/domain';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { PaymentRepository } from '../payments/paymentRepository.js';
import type { SupplierRepository } from './supplierRepository.js';

/**
 * GR-10 — resultado financeiro do grupo. Receita = contratado das inscrições
 * **confirmadas** (o pendente não é venda); gastos = soma dos contratados com
 * fornecedores. Margem bruta = receita − gastos (§3.6). Também expõe o caixa:
 * recebido dos clientes e pago aos fornecedores. Tudo derivado, nada em coluna.
 */

export interface GetGroupResultDeps {
  readonly schedule: ScheduleRepository;
  readonly bookings: BookingRepository;
  readonly payments: PaymentRepository;
  readonly suppliers: SupplierRepository;
}

export interface GetGroupResultCommand {
  readonly groupId: string;
}

export interface GroupResultView {
  readonly groupId: string;
  readonly revenueContractedCents: number;
  readonly receivedCents: number;
  readonly expenseTotalCents: number;
  readonly paidToSuppliersCents: number;
  readonly grossMarginCents: number;
  readonly marginPercent: number | null;
  readonly supplierOutstandingCents: number;
}

export async function getGroupResult(
  deps: GetGroupResultDeps,
  ctx: RequestContext,
  command: GetGroupResultCommand,
): Promise<GroupResultView> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('O resultado do grupo é da equipe');
  }

  const group = await deps.schedule.findGroupById(ctx.tenantId, command.groupId);
  if (!group) {
    throw new NotFoundError('grupo');
  }

  const bookings = await deps.bookings.listByGroup(ctx.tenantId, command.groupId);
  const revenueContractedCents = sumCents(
    bookings
      .filter((booking) => booking.status === 'confirmed')
      .map((booking) => contractedOf(booking.participants.map((p) => p.unitPriceCents))),
  );

  const customerPayments = await deps.payments.listByGroup(ctx.tenantId, command.groupId);
  const receivedCents = sumCents(customerPayments.map((payment) => payment.amountCents));

  const expenses = await deps.suppliers.listExpensesByGroup(ctx.tenantId, command.groupId);
  const expenseTotalCents = sumCents(expenses.map((expense) => expense.totalCents));

  const supplierPayments = await deps.suppliers.listPaymentsByGroup(ctx.tenantId, command.groupId);
  const paidToSuppliersCents = sumCents(supplierPayments.map((payment) => payment.amountCents));

  const result = computeGroupResult(revenueContractedCents, expenseTotalCents);

  return {
    groupId: command.groupId,
    revenueContractedCents,
    receivedCents,
    expenseTotalCents,
    paidToSuppliersCents,
    grossMarginCents: result.grossMarginCents,
    marginPercent: result.marginPercent,
    supplierOutstandingCents: subCents(expenseTotalCents, paidToSuppliersCents),
  };
}

function contractedOf(units: readonly Cents[]): Cents {
  return units.length === 0 ? cents(0) : sumCents(units);
}

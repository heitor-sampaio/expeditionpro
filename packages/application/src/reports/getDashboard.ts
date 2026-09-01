import { cents, compareLocalDate, subCents, sumCents } from '@expedition/domain';
import { ForbiddenError } from '../errors.js';
import type { Cents, LocalDate } from '@expedition/domain';
import type { RequestContext } from '../context.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { PaymentRepository } from '../payments/paymentRepository.js';
import type { IntakeRepository } from '../intake/intakeRepository.js';

/**
 * Dashboard operacional (back-office): panorama do tenant. Receita **confirmada × projetada**
 * (projetada = confirmada + pendente; somar pendente na receita infla o caixa, então fica
 * separado, §3.6), a receber, pendências (fila de alocação + inscrições pendentes) e as
 * próximas saídas. Tudo derivado. Dado financeiro → só a equipe.
 */

export interface GetDashboardDeps {
  readonly schedule: ScheduleRepository;
  readonly bookings: BookingRepository;
  readonly payments: PaymentRepository;
  readonly intake: IntakeRepository;
  readonly clock: () => Date;
}

export interface UpcomingGroup {
  readonly groupId: string;
  readonly groupName: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly confirmedCount: number;
  readonly pendingCount: number;
  readonly capacityVehicles: number | null;
}

export interface DashboardView {
  readonly confirmedRevenueCents: number;
  readonly projectedRevenueCents: number;
  readonly receivedCents: number;
  readonly dueCents: number;
  readonly pendingIntakeCount: number;
  readonly pendingBookingCount: number;
  readonly upcoming: readonly UpcomingGroup[];
}

const UPCOMING_LIMIT = 6;

export async function getDashboard(
  deps: GetDashboardDeps,
  ctx: RequestContext,
): Promise<DashboardView> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('Dashboard é da equipe');
  }

  const today = dateToLocalDate(deps.clock());
  const events = await deps.schedule.listEvents(ctx.tenantId);

  let confirmed: Cents = cents(0);
  let pending: Cents = cents(0);
  let received: Cents = cents(0);
  let pendingBookingCount = 0;
  const upcoming: UpcomingGroup[] = [];

  for (const { event, group } of events) {
    const bookings = await deps.bookings.listByGroup(ctx.tenantId, group.id);
    const confirmedHere = sumCents(
      bookings.filter((b) => b.status === 'confirmed').map((b) => contractedOf(b)),
    );
    const pendingHere = sumCents(
      bookings.filter((b) => b.status === 'pending').map((b) => contractedOf(b)),
    );
    const pendingCount = bookings.filter((b) => b.status === 'pending').length;
    confirmed = sumCents([confirmed, confirmedHere]);
    pending = sumCents([pending, pendingHere]);
    pendingBookingCount += pendingCount;

    const payments = await deps.payments.listByGroup(ctx.tenantId, group.id);
    received = sumCents([received, ...payments.map((p) => p.amountCents)]);

    if (compareLocalDate(event.startDate, today) >= 0) {
      upcoming.push({
        groupId: group.id,
        groupName: group.name,
        startDate: event.startDate,
        endDate: event.endDate,
        confirmedCount: bookings.filter((b) => b.status === 'confirmed').length,
        pendingCount,
        capacityVehicles: group.capacityVehicles,
      });
    }
  }

  upcoming.sort((a, b) => compareLocalDate(a.startDate, b.startDate));

  const queue = await deps.intake.listQueue(ctx.tenantId);

  return {
    confirmedRevenueCents: confirmed,
    projectedRevenueCents: sumCents([confirmed, pending]),
    receivedCents: received,
    dueCents: subCents(confirmed, received),
    pendingIntakeCount: queue.length,
    pendingBookingCount,
    upcoming: upcoming.slice(0, UPCOMING_LIMIT),
  };
}

function contractedOf(booking: { participants: readonly { unitPriceCents: Cents }[] }): Cents {
  const units = booking.participants.map((p) => p.unitPriceCents);
  return units.length === 0 ? cents(0) : sumCents(units);
}

function dateToLocalDate(date: Date): LocalDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

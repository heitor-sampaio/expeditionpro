import { denyCustomer } from '../audience.js';
import {
  describeVehicle,
  formatPlate,
  summarizeGroupBoard,
  sumCents,
  zeroCents,
  type Cents,
  type LocalDate,
} from '@expedition/domain';
import { NotFoundError } from '../errors.js';
import { bookingContracted } from './bookingTotals.js';
import type { RequestContext } from '../context.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { PaymentRepository } from '../payments/paymentRepository.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { VehicleRepository } from '../vehicles/vehicleRepository.js';
import type { BookingRecord, BookingRepository } from './bookingRepository.js';

/**
 * GR-07/GR-13 — leitura do grupo (Tabela 1). Monta o cabeçalho do grupo, uma linha
 * por inscrição com o **contratado derivado** (soma dos unitários congelados), o
 * **recebido** (soma dos recebimentos) e os totais do rodapé separando confirmado de
 * projetado. Contratado e recebido são sempre derivados, nunca coluna.
 */

export interface GetGroupBoardDeps {
  readonly schedule: ScheduleRepository;
  readonly bookings: BookingRepository;
  readonly payments: PaymentRepository;
  readonly customers: CustomerRepository;
  readonly vehicles: VehicleRepository;
}

export interface GroupBoardRowParticipant {
  readonly customerId: string;
  /** GR-07: quem é a pessoa. Resolvido aqui porque é o servidor que sabe ler cliente por id. */
  readonly fullName: string;
  readonly priceCategory: string;
  readonly unitPriceCents: number;
}

/** GR-14: o carro da família, pronto para a célula — sem ids de catálogo na tela. */
export interface GroupBoardVehicle {
  readonly model: string | null;
  readonly plate: string;
}

export interface GroupBoardRow {
  readonly bookingId: string;
  readonly responsibleCustomerId: string;
  readonly responsibleName: string;
  readonly status: string;
  readonly contractedCents: number;
  readonly receivedCents: number;
  readonly dueCents: number;
  readonly occupiesVehicle: boolean;
  readonly invoiceChecked: boolean;
  /** GR-14: instante do check-in; null enquanto a família não embarcou. */
  readonly checkedInAt: Date | null;
  readonly vehicle: GroupBoardVehicle | null;
  /** CP-05: o cupom que abateu esta linha. Null = sem desconto. */
  readonly coupon: GroupBoardCoupon | null;
  /** GR-04: algum participante teve o preço ajustado à mão. */
  readonly priceAdjusted: boolean;
  readonly participants: readonly GroupBoardRowParticipant[];
}

/**
 * O desconto na mesa. Vai junto do contratado porque um valor menor que a soma dos
 * unitários sem explicação ao lado é a definição de número que ninguém confia.
 */
export interface GroupBoardCoupon {
  readonly code: string;
  readonly discountCents: number;
}

export interface GroupBoardHeader {
  readonly id: string;
  /** AG-04/AG-05: editar e excluir a saída agem no evento de agenda, não no grupo. */
  readonly scheduleEventId: string | null;
  readonly name: string;
  readonly itineraryId: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly status: string;
  readonly visibility: string;
  readonly pricingMode: string;
}

export interface GroupBoardOccupancy {
  readonly capacityVehicles: number | null;
  readonly occupiedVehicles: number;
  readonly vacancies: number | null;
}

export interface GroupBoardTotals {
  readonly contractedConfirmedCents: number;
  readonly contractedProjectedCents: number;
  readonly receivedCents: number;
  readonly dueConfirmedCents: number;
  readonly dueProjectedCents: number;
  readonly confirmedCount: number;
  readonly pendingCount: number;
  /**
   * GR-13: o que os clientes pagaram, quando difere do recebido. A taxa é repassada
   * (PG-08), então o cliente paga mais do que quita a inscrição — e é o valor dele que
   * bate com o extrato do provedor.
   */
  readonly customerPaidCents: number;
}

export interface GroupBoardView {
  readonly group: GroupBoardHeader;
  readonly rows: readonly GroupBoardRow[];
  readonly totals: GroupBoardTotals;
  readonly occupancy: GroupBoardOccupancy;
}

export interface GetGroupBoardCommand {
  readonly groupId: string;
}

export async function getGroupBoard(
  deps: GetGroupBoardDeps,
  ctx: RequestContext,
  command: GetGroupBoardCommand,
): Promise<GroupBoardView> {
  denyCustomer(ctx);
  const groupContext = await deps.schedule.findGroupById(ctx.tenantId, command.groupId);
  if (!groupContext) {
    throw new NotFoundError('grupo');
  }

  const bookings = await deps.bookings.listByGroup(ctx.tenantId, command.groupId);
  const byId = new Map(bookings.map((booking) => [booking.id, booking]));

  const payments = await deps.payments.listByGroup(ctx.tenantId, command.groupId);
  const receivedByBooking = new Map<string, Cents>();
  for (const booking of bookings) {
    const amounts = payments
      .filter((payment) => payment.bookingId === booking.id)
      .map((payment) => payment.amountCents);
    receivedByBooking.set(booking.id, sumCents(amounts));
  }

  const summary = summarizeGroupBoard(
    bookings.map((booking) => ({
      bookingId: booking.id,
      status: booking.status,
      contractedCents: contractedOf(booking),
      receivedCents: receivedByBooking.get(booking.id) ?? zeroCents,
    })),
  );

  // GR-14: um carro por responsável, em uma consulta só — a mesa tem N linhas.
  const responsibleIds = [...new Set(bookings.map((b) => b.responsibleCustomerId))];
  const vehicles = await deps.vehicles.listByCustomers(ctx.tenantId, responsibleIds);
  const vehicleByCustomer = new Map(
    vehicles.map((vehicle) => [
      vehicle.customerId,
      { model: describeVehicle(vehicle), plate: formatPlate(vehicle.plate) },
    ]),
  );

  const nameByCustomer = new Map<string, string>();
  await Promise.all(
    [
      ...new Set(
        bookings.flatMap((b) => [
          b.responsibleCustomerId,
          ...b.participants.map((participant) => participant.customerId),
        ]),
      ),
    ].map(async (customerId) => {
      const customer = await deps.customers.findById(ctx.tenantId, customerId);
      nameByCustomer.set(customerId, customer?.fullName ?? '—');
    }),
  );

  const allRows: GroupBoardRow[] = summary.lines.map((line) => {
    const booking = byId.get(line.bookingId)!;
    return {
      bookingId: line.bookingId,
      responsibleCustomerId: booking.responsibleCustomerId,
      responsibleName: nameByCustomer.get(booking.responsibleCustomerId) ?? '—',
      status: line.status,
      contractedCents: line.contractedCents,
      receivedCents: line.receivedCents,
      dueCents: line.dueCents,
      occupiesVehicle: line.occupiesVehicle,
      invoiceChecked: booking.invoiceChecked,
      checkedInAt: booking.checkedInAt,
      vehicle: vehicleByCustomer.get(booking.responsibleCustomerId) ?? null,
      coupon: booking.discount
        ? { code: booking.discount.code, discountCents: Number(booking.discount.discountCents) }
        : null,
      // GR-04: a linha foi reprecificada à mão? É o que decide se a volta ao preço de
      // tabela é oferecida. Vem daqui e não da tela, que não deve varrer participante
      // para descobrir regra de negócio.
      priceAdjusted: booking.participants.some(
        (participant) => participant.priceSource === 'override',
      ),
      participants: booking.participants.map((participant) => ({
        customerId: participant.customerId,
        fullName: nameByCustomer.get(participant.customerId) ?? '—',
        priceCategory: participant.priceCategory,
        unitPriceCents: participant.unitPriceCents,
      })),
    };
  });

  // PG-08: o recebido do ledger já é líquido — a taxa é do cliente. Aqui só se soma o
  // que ele pagou, para conferir com o extrato do provedor.
  const customerPaidCents = payments.reduce(
    (sum, payment) => sum + Number(payment.customerPaidCents ?? payment.amountCents),
    0,
  );

  const capacity = groupContext.group.capacityVehicles;
  return {
    group: {
      id: groupContext.group.id,
      scheduleEventId: groupContext.group.scheduleEventId,
      name: groupContext.group.name,
      itineraryId: groupContext.group.itineraryId,
      startDate: groupContext.event.startDate,
      endDate: groupContext.event.endDate,
      status: groupContext.group.status,
      visibility: groupContext.group.visibility,
      pricingMode: groupContext.group.pricingMode,
    },
    // GR-07: cancelada saiu do grupo — o registro dela vive na lista de inscrições.
    rows: allRows.filter((row) => !isCancelled(row.status)),
    totals: {
      contractedConfirmedCents: summary.contractedConfirmedCents,
      contractedProjectedCents: summary.contractedProjectedCents,
      receivedCents: summary.receivedCents,
      dueConfirmedCents: summary.dueConfirmedCents,
      dueProjectedCents: summary.dueProjectedCents,
      confirmedCount: summary.confirmedCount,
      pendingCount: summary.pendingCount,
      customerPaidCents,
    },
    occupancy: {
      capacityVehicles: capacity,
      occupiedVehicles: summary.occupiedVehicles,
      vacancies: capacity === null ? null : capacity - summary.occupiedVehicles,
    },
  };
}

/** CP-05: o contratado vem do helper compartilhado — unitários congelados menos desconto. */
function contractedOf(booking: BookingRecord) {
  return bookingContracted(booking);
}

/** Cancelada ou recusada: saiu do grupo, mas continua no histórico. */
function isCancelled(status: string): boolean {
  return status === 'cancelled' || status === 'rejected';
}

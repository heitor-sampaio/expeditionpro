import {
  priceBooking,
  resolveApplicablePrice,
  sumCents,
  type BookingParticipantInput,
  type Cents,
  type PriceVersion,
} from '@expedition/domain';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { ItineraryRepository } from '../itineraries/itineraryRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type {
  BookingRecord,
  BookingRepository,
  ParticipantTablePrice,
} from './bookingRepository.js';

/**
 * GR-04 — desfaz o ajuste de valor, devolvendo a inscrição ao preço de tabela.
 *
 * Existe porque o ajuste **só abate**: sem esta volta, um desconto digitado errado deixa
 * a inscrição valendo menos para sempre, já que a tela não sobe valor.
 *
 * Restaurar não é "subir o valor à vontade" — é recalcular o que a tabela do roteiro diz
 * para **esta saída**, exatamente como a alocação fez (§3.4). A versão de preço é
 * resolvida pela **data de início do grupo**, então reajuste posterior do roteiro não
 * entra: quem restaura hoje chega ao mesmo número do dia da alocação. Por isso é a volta
 * segura, e não uma reprecificação disfarçada.
 *
 * A categoria também é recalculada pela idade na data de início — se a alocação achou
 * `CHILD_MID`, a restauração acha `CHILD_MID`, pela mesma conta e com a mesma data.
 */

export interface RestoreBookingTablePriceDeps {
  readonly bookings: BookingRepository;
  readonly customers: CustomerRepository;
  readonly schedule: ScheduleRepository;
  readonly itineraries: ItineraryRepository;
  readonly audit: AuditLogRepository;
}

export interface RestoreBookingTablePriceCommand {
  readonly bookingId: string;
}

export interface RestoredBooking {
  readonly booking: BookingRecord;
  readonly totalCents: Cents;
}

export async function restoreBookingTablePrice(
  deps: RestoreBookingTablePriceDeps,
  ctx: RequestContext,
  command: RestoreBookingTablePriceCommand,
): Promise<RestoredBooking> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Restaurar o preço exige owner ou admin');
  }

  const booking = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  if (!booking) {
    throw new NotFoundError('inscrição');
  }
  if (booking.status === 'cancelled') {
    throw new BusinessRuleError('booking_cancelled', 'Inscrição cancelada não é reprecificada');
  }
  if (!booking.participants.some((participant) => participant.priceSource === 'override')) {
    throw new BusinessRuleError('nothing_to_restore', 'Esta inscrição já está no preço de tabela');
  }

  const groupContext = await deps.schedule.findGroupById(ctx.tenantId, booking.groupId);
  if (!groupContext) {
    throw new NotFoundError('grupo');
  }
  // Grupo de preço manual não tem tabela para voltar: o valor sempre foi negociado.
  if (groupContext.group.pricingMode === 'manual') {
    throw new BusinessRuleError(
      'manual_pricing_unsupported',
      'Grupo com preço manual não tem preço de tabela para restaurar',
    );
  }

  const itinerary = await deps.itineraries.findById(ctx.tenantId, groupContext.group.itineraryId);
  if (!itinerary) {
    throw new NotFoundError('roteiro');
  }

  const startDate = groupContext.event.startDate;
  const versions = await deps.itineraries.listPrices(ctx.tenantId, itinerary.id);
  const prices = resolveApplicablePrice(versions as readonly PriceVersion[], startDate);
  if (prices === null) {
    throw new BusinessRuleError(
      'no_price_for_group_date',
      'Não há tabela de preços vigente na data de início do grupo',
    );
  }

  const inputs: BookingParticipantInput[] = [];
  for (const participant of booking.participants) {
    const customer = await deps.customers.findById(ctx.tenantId, participant.customerId);
    if (!customer) {
      throw new NotFoundError('participante');
    }
    inputs.push({ ref: customer.id, birthDate: customer.birthDate });
  }

  const pricing = priceBooking(
    inputs,
    startDate,
    { childYoungMaxAge: itinerary.childYoungMaxAge, childMidMaxAge: itinerary.childMidMaxAge },
    prices,
  );

  const fromCents = sumCents(booking.participants.map((p) => p.unitPriceCents));
  const tablePrices: ParticipantTablePrice[] = pricing.participants.map((snapshot) => ({
    customerId: snapshot.ref,
    unitPriceCents: snapshot.unitCents,
    priceCategory: snapshot.category,
  }));

  const updated = await deps.bookings.restoreParticipantTablePrices(
    ctx.tenantId,
    booking.id,
    tablePrices,
  );
  const totalCents = sumCents(updated.participants.map((p) => p.unitPriceCents));

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'booking',
    entityId: booking.id,
    action: 'booking.price_restore',
    diff: { fromCents: Number(fromCents), toCents: Number(totalCents) },
  });

  return { booking: updated, totalCents };
}

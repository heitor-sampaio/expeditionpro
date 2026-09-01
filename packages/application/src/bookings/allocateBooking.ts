import {
  cashbackAppliesToSource,
  priceBooking,
  resolveApplicablePrice,
  resolveCashbackRule,
  type BookingParticipantInput,
  type Cents,
  type PriceVersion,
} from '@expedition/domain';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { ItineraryRepository } from '../itineraries/itineraryRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { CashbackRepository } from '../cashback/cashbackRepository.js';
import type {
  BookingRecord,
  BookingRepository,
  NewBookingParticipant,
} from './bookingRepository.js';

/**
 * GR-01/GR-03 + IN-07/IN-18 (caminho manual) — aloca uma família num grupo.
 *
 * Em transação única: valida o grupo e os participantes, resolve a tabela de preços
 * vigente na **data de início do grupo**, congela categoria e valor unitário por
 * participante (§3.4) e cria a inscrição `pending`. O congelamento acontece aqui,
 * na alocação, porque é onde a data de início existe.
 *
 * Grupo `pricing_mode: manual` (valor livre por inscrição) é outro caminho — este
 * caso de uso é o automático pelo roteiro.
 */

export interface AllocateBookingDeps {
  readonly bookings: BookingRepository;
  readonly schedule: ScheduleRepository;
  readonly itineraries: ItineraryRepository;
  readonly customers: CustomerRepository;
  readonly cashback: CashbackRepository;
}

export interface AllocateBookingCommand {
  readonly groupId: string;
  readonly responsibleCustomerId: string;
  readonly participantCustomerIds: readonly string[];
  /**
   * Origem da inscrição (§5.8): só `portal` (o cliente se inscreve pelo app) congela a
   * regra de cashback; `manual` (equipe) e `webhook` (formulário) nunca geram crédito.
   */
  readonly source: string;
}

export interface AllocatedBooking {
  readonly booking: BookingRecord;
  readonly totalCents: Cents;
}

export async function allocateBooking(
  deps: AllocateBookingDeps,
  ctx: RequestContext,
  command: AllocateBookingCommand,
): Promise<AllocatedBooking> {
  if (command.participantCustomerIds.length === 0) {
    throw new BusinessRuleError(
      'no_participants',
      'A inscrição precisa de ao menos um participante',
    );
  }

  const groupContext = await deps.schedule.findGroupById(ctx.tenantId, command.groupId);
  if (!groupContext) {
    throw new NotFoundError('grupo');
  }
  if (groupContext.group.pricingMode === 'manual') {
    throw new BusinessRuleError(
      'manual_pricing_unsupported',
      'Grupo com preço manual exige valor por inscrição — use o caminho manual',
    );
  }

  const alreadyAllocated = await deps.bookings.existsForResponsible(
    ctx.tenantId,
    command.groupId,
    command.responsibleCustomerId,
  );
  if (alreadyAllocated) {
    throw new BusinessRuleError('already_allocated', 'Esse responsável já tem inscrição no grupo');
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

  const inputs = await loadParticipants(deps, ctx, command);

  const pricing = priceBooking(
    inputs,
    startDate,
    { childYoungMaxAge: itinerary.childYoungMaxAge, childMidMaxAge: itinerary.childMidMaxAge },
    prices,
  );

  const participants: NewBookingParticipant[] = pricing.participants.map((snapshot) => ({
    customerId: snapshot.ref,
    priceCategory: snapshot.category,
    unitPriceCents: snapshot.unitCents,
    priceSource: 'auto',
    priceNote: null,
  }));

  // §5.8 + CB-09: o cashback só vale na auto-inscrição do cliente pelo app (`portal`).
  // Nessa origem, congela a regra vigente (config + override) na inscrição — mudar a config
  // amanhã não altera esta saída. Equipe/webhook nunca geram crédito → `{ rule: null }`.
  const cashbackRuleSnapshot = { rule: await resolveFrozenRule(deps, ctx, command) };

  const booking = await deps.bookings.create({
    tenantId: ctx.tenantId,
    groupId: command.groupId,
    responsibleCustomerId: command.responsibleCustomerId,
    status: 'pending',
    source: command.source,
    participants,
    cashbackRuleSnapshot,
  });

  return { booking, totalCents: pricing.total };
}

/** Regra de cashback a congelar: só a origem elegível (`portal`) resolve; senão null. */
async function resolveFrozenRule(
  deps: AllocateBookingDeps,
  ctx: RequestContext,
  command: AllocateBookingCommand,
) {
  if (!cashbackAppliesToSource(command.source)) return null;
  const config = await deps.cashback.getConfig(ctx.tenantId);
  const override = await deps.cashback.getGroupOverride(ctx.tenantId, command.groupId);
  return resolveCashbackRule(config, override);
}

/**
 * Carrega os participantes na ordem em que precificam: o responsável primeiro (para
 * ancorar a base COUPLE/SOLO), depois os demais na ordem recebida. Participante fora
 * do tenant ou inexistente barra a alocação inteira.
 */
async function loadParticipants(
  deps: AllocateBookingDeps,
  ctx: RequestContext,
  command: AllocateBookingCommand,
): Promise<BookingParticipantInput[]> {
  const ordered = orderResponsibleFirst(
    command.participantCustomerIds,
    command.responsibleCustomerId,
  );
  const inputs: BookingParticipantInput[] = [];
  for (const customerId of ordered) {
    const customer = await deps.customers.findById(ctx.tenantId, customerId);
    if (!customer) {
      throw new NotFoundError('participante');
    }
    inputs.push({ ref: customer.id, birthDate: customer.birthDate });
  }
  return inputs;
}

function orderResponsibleFirst(ids: readonly string[], responsibleId: string): string[] {
  const rest = ids.filter((id) => id !== responsibleId);
  return ids.includes(responsibleId) ? [responsibleId, ...rest] : [...rest];
}

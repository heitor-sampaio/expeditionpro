import { denyCustomer } from '../audience.js';
import { zeroCents, type Cents } from '@expedition/domain';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type {
  BookingRecord,
  BookingRepository,
  NewBookingParticipant,
} from './bookingRepository.js';

/**
 * AG-08 — aloca uma família num grupo de **preço manual** (`pricing_mode: manual`): pacote
 * fechado negociado. Não aplica as categorias por idade — o valor é livre por inscrição e
 * congela na inscrição do mesmo jeito (§3.4). O total vai numa linha `MANUAL` no
 * responsável; os demais participantes entram na inscrição com valor 0 (também `MANUAL`).
 * É inscrição da equipe (`manual`) — não gera cashback (§5.8).
 */

export interface AllocateManualBookingDeps {
  readonly bookings: BookingRepository;
  readonly schedule: ScheduleRepository;
  readonly customers: CustomerRepository;
}

export interface AllocateManualBookingCommand {
  readonly groupId: string;
  readonly responsibleCustomerId: string;
  readonly participantCustomerIds: readonly string[];
  readonly totalCents: Cents;
  readonly note?: string | null;
}

export interface AllocatedManualBooking {
  readonly booking: BookingRecord;
  readonly totalCents: Cents;
}

export async function allocateManualBooking(
  deps: AllocateManualBookingDeps,
  ctx: RequestContext,
  command: AllocateManualBookingCommand,
): Promise<AllocatedManualBooking> {
  denyCustomer(ctx);
  if (command.participantCustomerIds.length === 0) {
    throw new BusinessRuleError(
      'no_participants',
      'A inscrição precisa de ao menos um participante',
    );
  }
  if (command.totalCents < 0) {
    throw new BusinessRuleError('invalid_total', 'O valor do pacote não pode ser negativo');
  }

  const groupContext = await deps.schedule.findGroupById(ctx.tenantId, command.groupId);
  if (!groupContext) {
    throw new NotFoundError('grupo');
  }
  if (groupContext.group.pricingMode !== 'manual') {
    throw new BusinessRuleError(
      'not_manual_pricing',
      'Grupo não é de preço manual — use o caminho automático',
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

  await assertParticipantsExist(deps, ctx, command);

  const participants = buildManualParticipants(command);

  const booking = await deps.bookings.create({
    tenantId: ctx.tenantId,
    groupId: command.groupId,
    responsibleCustomerId: command.responsibleCustomerId,
    status: 'pending',
    source: 'manual',
    participants,
    // §5.8: pacote de preço manual é inscrição da equipe — nunca gera cashback.
    cashbackRuleSnapshot: { rule: null },
  });

  return { booking, totalCents: command.totalCents };
}

/** O valor livre vai inteiro no responsável; os demais entram com 0 (linha `MANUAL`). */
function buildManualParticipants(command: AllocateManualBookingCommand): NewBookingParticipant[] {
  const responsibleFirst = orderResponsibleFirst(
    command.participantCustomerIds,
    command.responsibleCustomerId,
  );
  return responsibleFirst.map((customerId, index) => ({
    customerId,
    priceCategory: 'MANUAL' as const,
    unitPriceCents: index === 0 ? command.totalCents : zeroCents,
    priceSource: 'manual',
    priceNote: index === 0 ? (command.note ?? null) : null,
  }));
}

async function assertParticipantsExist(
  deps: AllocateManualBookingDeps,
  ctx: RequestContext,
  command: AllocateManualBookingCommand,
): Promise<void> {
  for (const customerId of command.participantCustomerIds) {
    const customer = await deps.customers.findById(ctx.tenantId, customerId);
    if (!customer) {
      throw new NotFoundError('participante');
    }
  }
}

function orderResponsibleFirst(ids: readonly string[], responsibleId: string): string[] {
  const rest = ids.filter((id) => id !== responsibleId);
  return ids.includes(responsibleId) ? [responsibleId, ...rest] : [...rest];
}

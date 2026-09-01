import {
  calculateBookingTotal,
  formatPhone,
  fullYearsBetween,
  resolveApplicablePrice,
  resolvePriceCategory,
  type AgeBand,
  type LocalDate,
} from '@expedition/domain';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CashbackRepository } from '../cashback/cashbackRepository.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { IntakeRepository } from './intakeRepository.js';
import type { ItineraryRepository } from '../itineraries/itineraryRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';

/**
 * IN-17c — tudo o que a equipe precisa para decidir sobre um item da fila, numa leitura só:
 * quem são as pessoas, **que idade cada uma terá na data da saída** (§3.4 — é a idade da
 * viagem que define a faixa, não a de hoje), quanto custaria naquela saída, se o
 * responsável já é cliente e quanto ele tem de cashback.
 *
 * Sem grupo escolhido não há data: aí não se calcula idade de viagem nem valor — em vez de
 * exibir um número que muda depois, a tela mostra nada.
 */

export interface IntakePerson {
  readonly fullName: string;
  readonly cpf: string;
  readonly birthDate: LocalDate;
  /** Idade na data de início da saída escolhida; null sem saída. */
  readonly age: number | null;
  readonly band: AgeBand | null;
}

export interface IntakeResponsible extends IntakePerson {
  readonly email: string;
  readonly phone: string;
  /** Telefone pronto para link do WhatsApp (só dígitos, com DDI). */
  readonly phoneDigits: string;
  readonly phoneDisplay: string;
  /** IN-03: já existe cliente com este CPF? Então a alocação reaproveita o cadastro. */
  readonly existingCustomerId: string | null;
  readonly cashbackBalanceCents: number;
}

export interface IntakeQuote {
  readonly groupId: string;
  readonly groupName: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly totalCents: number;
}

export interface IntakeDetail {
  readonly id: string;
  readonly source: string;
  readonly status: string;
  readonly responsible: IntakeResponsible;
  readonly companions: readonly IntakePerson[];
  /** §5.8: a saída que o cliente escolheu no app; null quando veio do formulário. */
  readonly chosenGroupId: string | null;
  readonly quote: IntakeQuote | null;
}

export interface GetIntakeDetailDeps {
  readonly intake: IntakeRepository;
  readonly customers: CustomerRepository;
  readonly cashback: CashbackRepository;
  readonly schedule: ScheduleRepository;
  readonly itineraries: ItineraryRepository;
}

export interface GetIntakeDetailCommand {
  readonly intakeId: string;
  /** Saída em avaliação: define idade da viagem e valor. */
  readonly groupId?: string | undefined;
}

export async function getIntakeDetail(
  deps: GetIntakeDetailDeps,
  ctx: RequestContext,
  command: GetIntakeDetailCommand,
): Promise<IntakeDetail> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('A fila de inscrições é da equipe');
  }

  const intake = await deps.intake.findForAllocation(ctx.tenantId, command.intakeId);
  if (!intake) throw new NotFoundError('inscrição recebida');

  const chosenGroupId = chosenGroupOf(intake.payload);
  const groupId = command.groupId ?? chosenGroupId;
  const context = groupId ? await deps.schedule.findGroupById(ctx.tenantId, groupId) : null;
  const startDate = context?.event.startDate ?? null;

  const itinerary = context
    ? await deps.itineraries.findById(ctx.tenantId, context.group.itineraryId)
    : null;
  const bands = itinerary
    ? {
        childYoungMaxAge: itinerary.childYoungMaxAge,
        childMidMaxAge: itinerary.childMidMaxAge,
      }
    : null;

  const people = [intake.normalized.responsible, ...intake.normalized.companions];
  const resolved = people.map((person) => ({
    fullName: person.fullName,
    cpf: person.cpf,
    birthDate: person.birthDate,
    age: startDate ? fullYearsBetween(person.birthDate, startDate) : null,
    band: startDate && bands ? resolvePriceCategory(person.birthDate, startDate, bands) : null,
  }));

  const existing = await deps.customers.findByCpf(ctx.tenantId, intake.normalized.responsible.cpf);
  const balance = existing ? await deps.cashback.balance(ctx.tenantId, existing.id) : 0;

  return {
    id: intake.id,
    source: intake.source,
    status: intake.status,
    responsible: {
      ...resolved[0]!,
      email: intake.normalized.responsible.email,
      phone: intake.normalized.responsible.phone,
      phoneDigits: intake.normalized.responsible.phone.replace(/\D/g, ''),
      phoneDisplay: formatPhone(intake.normalized.responsible.phone),
      existingCustomerId: existing?.id ?? null,
      cashbackBalanceCents: Number(balance),
    },
    companions: resolved.slice(1),
    chosenGroupId,
    quote: await quoteFor(deps, ctx, context, resolved),
  };
}

async function quoteFor(
  deps: GetIntakeDetailDeps,
  ctx: RequestContext,
  context: Awaited<ReturnType<ScheduleRepository['findGroupById']>>,
  people: readonly { band: AgeBand | null }[],
): Promise<IntakeQuote | null> {
  if (!context) return null;
  const bands = people.map((p) => p.band).filter((b): b is AgeBand => b !== null);
  if (bands.length !== people.length) return null;

  const versions = await deps.itineraries.listPrices(ctx.tenantId, context.group.itineraryId);
  const table = resolveApplicablePrice(versions, context.event.startDate);
  if (!table) return null;

  return {
    groupId: context.group.id,
    groupName: context.group.name,
    startDate: context.event.startDate,
    endDate: context.event.endDate,
    totalCents: Number(calculateBookingTotal(bands, table)),
  };
}

/** A saída escolhida pelo cliente no app (payload `portal_enrollment`), quando houver. */
function chosenGroupOf(payload: unknown): string | null {
  const candidate = payload as { kind?: string; groupId?: string } | null | undefined;
  if (!candidate || candidate.kind !== 'portal_enrollment') return null;
  return candidate.groupId ?? null;
}

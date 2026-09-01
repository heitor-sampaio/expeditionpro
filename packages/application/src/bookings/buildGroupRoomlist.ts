import {
  buildRoomlist,
  type LocalDate,
  type RoomlistEntry,
  type RoomlistParty,
} from '@expedition/domain';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { CustomerRecord, CustomerRepository } from '../customers/customerRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { CompanyInfo, CrewLead, TenantRepository } from '../tenants/tenantRepository.js';
import type { BookingRecord, BookingRepository } from './bookingRepository.js';

/**
 * GR-15 — monta a roomlist do grupo: o que vai no documento que a empresa manda ao hotel.
 *
 * Duas réguas próprias, diferentes das da mesa: entra **só inscrição confirmada** (é quem
 * ocupa vaga, GR-12), e os acompanhantes vêm dos **participantes daquela inscrição**, não
 * da família cadastrada — nem todo mundo da família vai em toda saída (GR-02), e mandar
 * ao hotel quem ficou em casa seria dado errado e dado pessoal de terceiro sem finalidade.
 *
 * O **condutor da empresa** (CF-05) abre o documento quando o tenant o cadastrou em
 * Configurações → Equipe. Até 2026-08-31 ele era constante no código; virar cadastro tirou
 * dado pessoal do repositório e passou a servir qualquer tenant.
 *
 * Exige owner ou admin: o resultado é uma cópia consolidada de CPF e endereço de todas as
 * famílias da saída, e toda geração vai para a trilha (§3.2.1).
 *
 * Devolve o documento como **dados**, não como arquivo. Quem transforma em PDF é a
 * infraestrutura — assim a régua de quem entra na lista se testa sem renderizar nada.
 */

export interface BuildGroupRoomlistDeps {
  readonly schedule: ScheduleRepository;
  readonly bookings: BookingRepository;
  readonly customers: CustomerRepository;
  readonly tenants: TenantRepository;
  readonly audit: AuditLogRepository;
  readonly clock: () => Date;
}

export interface BuildGroupRoomlistCommand {
  readonly groupId: string;
}

export interface GroupRoomlistView {
  readonly company: CompanyInfo;
  readonly group: {
    readonly name: string;
    readonly itineraryName: string;
    readonly startDate: LocalDate;
    readonly endDate: LocalDate;
  };
  readonly entries: readonly RoomlistEntry[];
  /** Pessoas no total — responsáveis mais acompanhantes. É o que o hotel bloqueia. */
  readonly guestCount: number;
  readonly generatedAt: Date;
}

export async function buildGroupRoomlist(
  deps: BuildGroupRoomlistDeps,
  ctx: RequestContext,
  command: BuildGroupRoomlistCommand,
): Promise<GroupRoomlistView> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Gerar roomlist exige owner ou admin');
  }

  const group = await deps.schedule.findGroupById(ctx.tenantId, command.groupId);
  if (!group) throw new NotFoundError('grupo');

  const bookings = await deps.bookings.listByGroup(ctx.tenantId, command.groupId);
  const confirmed = bookings.filter((booking) => booking.status === 'confirmed');

  const people = await loadPeople(deps.customers, ctx.tenantId, confirmed);
  const parties = confirmed
    .map((booking) => toParty(booking, people))
    .filter((party): party is RoomlistParty => party !== null);

  const [company, crew] = await Promise.all([
    deps.tenants.getCompanyInfo(ctx.tenantId),
    deps.tenants.getCrewLead(ctx.tenantId),
  ]);
  const entries = buildRoomlist({ lead: toLeadParty(crew), parties });

  const guestCount = entries.reduce((total, entry) => total + 1 + entry.companions.length, 0);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'group',
    entityId: command.groupId,
    action: 'roomlist.generate',
    // Só contagens: a trilha registra que o documento saiu, não uma segunda cópia dele.
    diff: {
      entries: entries.length,
      guests: guestCount,
      leadApplied: crew !== null,
    },
  });

  return {
    company,
    group: {
      name: group.group.name,
      itineraryName: group.group.name,
      startDate: group.event.startDate,
      endDate: group.event.endDate,
    },
    entries,
    guestCount,
    generatedAt: deps.clock(),
  };
}

/** O condutor cadastrado, no formato que o documento monta. */
function toLeadParty(crew: CrewLead | null): RoomlistParty | null {
  if (crew === null) return null;
  return {
    responsible: {
      fullName: crew.fullName,
      cpf: crew.cpf,
      birthDate: crew.birthDate,
      email: crew.email,
      phone: crew.phone,
      address: crew.address,
    },
    companions: crew.companions.map((companion) => ({
      fullName: companion.fullName,
      birthDate: companion.birthDate,
    })),
  };
}

/** Todo mundo do grupo numa consulta só: responsáveis e participantes juntos. */
async function loadPeople(
  customers: CustomerRepository,
  tenantId: string,
  bookings: readonly BookingRecord[],
): Promise<Map<string, CustomerRecord>> {
  const ids = new Set<string>();
  for (const booking of bookings) {
    ids.add(booking.responsibleCustomerId);
    for (const participant of booking.participants) ids.add(participant.customerId);
  }
  const records = await customers.listByIds(tenantId, [...ids]);
  return new Map(records.map((record) => [record.id, record]));
}

/**
 * Uma inscrição vira um registro. Sem o responsável no cadastro não há registro: o hotel
 * precisa de um titular com documento, e inventar um a partir do acompanhante seria pior
 * que a linha faltando.
 */
function toParty(
  booking: BookingRecord,
  people: Map<string, CustomerRecord>,
): RoomlistParty | null {
  const responsible = people.get(booking.responsibleCustomerId);
  if (!responsible) return null;

  const companions = booking.participants
    .filter((participant) => participant.customerId !== booking.responsibleCustomerId)
    .map((participant) => people.get(participant.customerId))
    .filter((person): person is CustomerRecord => person !== undefined)
    .map((person) => ({ fullName: person.fullName, birthDate: person.birthDate }));

  return {
    responsible: {
      fullName: responsible.fullName,
      cpf: responsible.cpf,
      birthDate: responsible.birthDate,
      email: responsible.email,
      phone: responsible.phone,
      address: responsible.address,
    },
    companions,
  };
}

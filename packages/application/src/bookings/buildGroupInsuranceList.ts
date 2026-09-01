import {
  buildInsuranceList,
  type InsurancePerson,
  type InsuranceRow,
  type LocalDate,
} from '@expedition/domain';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { CustomerRecord, CustomerRepository } from '../customers/customerRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { TenantRepository } from '../tenants/tenantRepository.js';
import type { BookingRepository } from './bookingRepository.js';

/**
 * GR-16 — monta a lista do seguro do grupo.
 *
 * Mesma régua de quem viaja da roomlist (só inscrição **confirmada**, participantes da
 * inscrição e não a família cadastrada), com duas diferenças que vêm do que o documento
 * é: **uma linha por pessoa**, porque seguro cobre vida e não quarto; e **sem o condutor
 * da empresa**, que tem seguro próprio e entraria como cobrança indevida.
 *
 * Exige owner ou admin: é exportação de CPF em massa, e toda geração vai para a trilha.
 */

export interface BuildGroupInsuranceListDeps {
  readonly schedule: ScheduleRepository;
  readonly bookings: BookingRepository;
  readonly customers: CustomerRepository;
  readonly tenants: TenantRepository;
  readonly audit: AuditLogRepository;
  readonly clock: () => Date;
}

export interface BuildGroupInsuranceListCommand {
  readonly groupId: string;
}

export interface GroupInsuranceView {
  readonly group: { readonly name: string; readonly startDate: LocalDate };
  readonly rows: readonly InsuranceRow[];
  readonly generatedAt: Date;
}

export async function buildGroupInsuranceList(
  deps: BuildGroupInsuranceListDeps,
  ctx: RequestContext,
  command: BuildGroupInsuranceListCommand,
): Promise<GroupInsuranceView> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Gerar a lista do seguro exige owner ou admin');
  }

  const group = await deps.schedule.findGroupById(ctx.tenantId, command.groupId);
  if (!group) throw new NotFoundError('grupo');

  const bookings = await deps.bookings.listByGroup(ctx.tenantId, command.groupId);
  const confirmed = bookings.filter((booking) => booking.status === 'confirmed');

  // Todo mundo numa consulta só, e na ordem das inscrições: o responsável de cada uma
  // antes dos seus acompanhantes, que é como o corretor confere a lista.
  const ids: string[] = [];
  for (const booking of confirmed) {
    ids.push(booking.responsibleCustomerId);
    for (const participant of booking.participants) {
      if (participant.customerId !== booking.responsibleCustomerId)
        ids.push(participant.customerId);
    }
  }
  const records = await deps.customers.listByIds(ctx.tenantId, [...new Set(ids)]);
  const byId = new Map(records.map((record) => [record.id, record]));

  const people = ids
    .map((id) => byId.get(id))
    .filter((record): record is CustomerRecord => record !== undefined)
    .map(toPerson);

  const rows = buildInsuranceList(people);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'group',
    entityId: command.groupId,
    action: 'insurance.generate',
    diff: { people: rows.length, bookings: confirmed.length },
  });

  return {
    group: { name: group.group.name, startDate: group.event.startDate },
    rows,
    generatedAt: deps.clock(),
  };
}

function toPerson(customer: CustomerRecord): InsurancePerson {
  return {
    fullName: customer.fullName,
    cpf: customer.cpf,
    birthDate: customer.birthDate,
    email: customer.email,
    phone: customer.phone,
  };
}

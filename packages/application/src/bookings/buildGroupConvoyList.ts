import {
  buildConvoyList,
  type ConvoyEntry,
  type ConvoyRow,
  type LocalDate,
} from '@expedition/domain';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { TenantRepository } from '../tenants/tenantRepository.js';
import type { VehicleRepository } from '../vehicles/vehicleRepository.js';
import type { BookingRepository } from './bookingRepository.js';

/**
 * GR-17 — monta a lista do comboio: quem dirige o quê, na ordem em que os carros saem.
 *
 * Uma linha por inscrição **confirmada**, com o carro do responsável — é ele quem dirige.
 * O carro do condutor da empresa (CF-04) abre a lista quando a configuração o declara.
 *
 * Inscrição sem veículo cadastrado **aparece com os campos vazios**: o documento denuncia
 * o que falta, e é assim que se descobre o carro que ninguém cadastrou antes da saída, em
 * vez de na estrada.
 */

export interface BuildGroupConvoyListDeps {
  readonly schedule: ScheduleRepository;
  readonly bookings: BookingRepository;
  readonly customers: CustomerRepository;
  readonly vehicles: VehicleRepository;
  readonly tenants: TenantRepository;
  readonly audit: AuditLogRepository;
  readonly clock: () => Date;
}

export interface BuildGroupConvoyListCommand {
  readonly groupId: string;
}

export interface GroupConvoyView {
  readonly company: { readonly name: string; readonly logo: string | null };
  readonly group: { readonly name: string; readonly startDate: LocalDate };
  readonly rows: readonly ConvoyRow[];
  readonly generatedAt: Date;
}

export async function buildGroupConvoyList(
  deps: BuildGroupConvoyListDeps,
  ctx: RequestContext,
  command: BuildGroupConvoyListCommand,
): Promise<GroupConvoyView> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Gerar a lista do comboio exige owner ou admin');
  }

  const group = await deps.schedule.findGroupById(ctx.tenantId, command.groupId);
  if (!group) throw new NotFoundError('grupo');

  const bookings = await deps.bookings.listByGroup(ctx.tenantId, command.groupId);
  const confirmed = bookings.filter((booking) => booking.status === 'confirmed');
  const responsibleIds = confirmed.map((booking) => booking.responsibleCustomerId);

  // Duas leituras em lote, como a mesa faz: nomes e carros dos responsáveis.
  const [people, vehicles, company, crew] = await Promise.all([
    deps.customers.listByIds(ctx.tenantId, [...new Set(responsibleIds)]),
    deps.vehicles.listByCustomers(ctx.tenantId, [...new Set(responsibleIds)]),
    deps.tenants.getCompanyInfo(ctx.tenantId),
    deps.tenants.getCrewLead(ctx.tenantId),
  ]);
  const nameById = new Map(people.map((person) => [person.id, person.fullName]));
  const vehicleByCustomer = new Map(vehicles.map((vehicle) => [vehicle.customerId, vehicle]));

  const entries: ConvoyEntry[] = responsibleIds.map((customerId) => {
    const vehicle = vehicleByCustomer.get(customerId);
    return {
      driver: nameById.get(customerId) ?? '—',
      brand: vehicle ? (vehicle.brandName ?? vehicle.brandOther) : null,
      // Colunas separadas: marca e modelo vêm do catálogo, ou do "Outro" digitado no
      // cadastro quando o veículo não está catalogado (CL-05).
      model: vehicle ? (vehicle.modelName ?? vehicle.modelOther) : null,
      plate: vehicle?.plate ?? null,
    };
  });

  // O condutor abre o comboio com o carro dele (CF-04/CF-05). Sem veículo cadastrado
  // não há linha: um carro sem placa na lista não ajuda ninguém na estrada.
  const lead: ConvoyEntry | null =
    crew?.vehicle == null
      ? null
      : {
          driver: crew.fullName,
          brand: crew.vehicle.brand,
          model: crew.vehicle.model,
          plate: crew.vehicle.plate,
        };

  const rows = buildConvoyList({ lead, entries });

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'group',
    entityId: command.groupId,
    action: 'convoy.generate',
    diff: { vehicles: rows.length, leadApplied: lead !== null },
  });

  return {
    company: { name: company.name, logo: company.logo },
    group: { name: group.group.name, startDate: group.event.startDate },
    rows,
    generatedAt: deps.clock(),
  };
}

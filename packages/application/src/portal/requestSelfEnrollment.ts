import type { MappedIntake } from '@expedition/domain';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import { actorFamilyHead, assertActorManagesCustomer } from './familyScope.js';
import type { RequestContext } from '../context.js';
import type { CustomerRecord, CustomerRepository } from '../customers/customerRepository.js';
import type { IntakeRepository } from '../intake/intakeRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';

/**
 * §5.8 — o cliente escolhe a saída e quem da família vai, e o pedido entra na **fila de
 * inscrições não processadas**. Não vira inscrição sozinho: a equipe revisa e aloca no
 * grupo (decisão do dono do produto — todo caminho de entrada passa pelo mesmo funil,
 * venha do site ou do app).
 *
 * O pedido guarda os **ids já escolhidos** (payload `portal_enrollment`), então a alocação
 * não recria cliente nem repete a escolha; e guarda o resumo no formato da fila, para o
 * admin ver nome, CPF mascarado e acompanhantes como em qualquer outro item.
 *
 * A origem fica `portal` — é ela que preserva o cashback quando a equipe alocar (CB-09).
 */

export const PORTAL_ENROLLMENT_KIND = 'portal_enrollment';

export interface PortalEnrollmentPayload {
  readonly kind: typeof PORTAL_ENROLLMENT_KIND;
  readonly groupId: string;
  readonly headCustomerId: string;
  readonly participantCustomerIds: readonly string[];
}

export interface RequestSelfEnrollmentDeps {
  readonly customers: CustomerRepository;
  readonly schedule: ScheduleRepository;
  readonly intake: IntakeRepository;
  readonly clock: () => Date;
}

export interface RequestSelfEnrollmentCommand {
  readonly groupId: string;
  readonly participantCustomerIds: readonly string[];
}

export interface EnrollmentRequested {
  readonly intakeId: string;
}

export async function requestSelfEnrollment(
  deps: RequestSelfEnrollmentDeps,
  ctx: RequestContext,
  command: RequestSelfEnrollmentCommand,
): Promise<EnrollmentRequested> {
  if (ctx.actor.kind !== 'customer') {
    throw new ForbiddenError('A auto-inscrição é feita pelo cliente no app');
  }
  if (command.participantCustomerIds.length === 0) {
    throw new BusinessRuleError(
      'no_participants',
      'A inscrição precisa de ao menos um participante',
    );
  }

  const group = await deps.schedule.findGroupById(ctx.tenantId, command.groupId);
  if (!group) throw new NotFoundError('grupo');
  if (group.group.status !== 'open' || group.group.visibility !== 'public') {
    throw new BusinessRuleError('group_not_open', 'Só dá para se inscrever numa saída aberta');
  }

  // Todos os participantes têm que ser da família do ator (mesmo head).
  const head = await actorFamilyHead(deps.customers, ctx);
  for (const customerId of command.participantCustomerIds) {
    await assertActorManagesCustomer(deps.customers, ctx, customerId);
  }

  const people = await loadPeople(deps.customers, ctx.tenantId, command.participantCustomerIds);
  const responsible = people.find((p) => p.id === head) ?? people[0]!;

  const payload: PortalEnrollmentPayload = {
    kind: PORTAL_ENROLLMENT_KIND,
    groupId: group.group.id,
    headCustomerId: head,
    participantCustomerIds: [...command.participantCustomerIds],
  };

  const stored = await deps.intake.store({
    tenantId: ctx.tenantId,
    source: 'portal',
    externalId: null,
    payload,
    normalized: toQueueSummary(responsible, people, group.event.startDate),
    formId: null,
    itineraryId: group.group.itineraryId,
    submittedAt: deps.clock().toISOString(),
    status: 'needs_allocation',
    error: null,
    isTest: false,
  });

  return { intakeId: stored.id };
}

async function loadPeople(
  customers: CustomerRepository,
  tenantId: string,
  ids: readonly string[],
): Promise<CustomerRecord[]> {
  const people: CustomerRecord[] = [];
  for (const id of ids) {
    const person = await customers.findById(tenantId, id);
    if (!person) throw new NotFoundError('participante');
    people.push(person);
  }
  return people;
}

/**
 * O resumo que a fila mostra. O pedido do portal não vem de formulário, mas usa o mesmo
 * formato para o admin ler tudo do mesmo jeito — sem uma segunda tela de revisão.
 */
function toQueueSummary(
  responsible: CustomerRecord,
  people: readonly CustomerRecord[],
  startDate: MappedIntake['desiredDate'],
): MappedIntake {
  return {
    formId: 'portal',
    entryId: '',
    submitted: null,
    desiredDate: startDate,
    responsible: {
      fullName: responsible.fullName,
      cpf: responsible.cpf,
      birthDate: responsible.birthDate,
      email: responsible.email ?? '',
      phone: responsible.phone ?? '',
    },
    address: responsible.address,
    vehicle: null,
    companions: people
      .filter((p) => p.id !== responsible.id)
      .map((p) => ({ fullName: p.fullName, cpf: p.cpf, birthDate: p.birthDate })),
    consent: true,
    warnings: [],
    customFields: {},
  };
}

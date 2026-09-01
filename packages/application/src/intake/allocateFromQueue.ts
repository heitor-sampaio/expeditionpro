import { requireWriter } from '../audience.js';
import {
  detectCustomerDivergence,
  hasDivergence,
  parseCpf,
  resolveTermVariables,
  type CustomerFacts,
  type MappedIntake,
} from '@expedition/domain';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { allocateBooking } from '../bookings/allocateBooking.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import {
  PORTAL_ENROLLMENT_KIND,
  type PortalEnrollmentPayload,
} from '../portal/requestSelfEnrollment.js';
import { TERM_DOCUMENT_NAME } from '../documents/saveTermDraft.js';
import type { RequestContext } from '../context.js';
import type { CustomerRecord, NewCustomer } from '../customers/customerRepository.js';
import type { AllocationRepositories, UnitOfWork } from '../transaction/unitOfWork.js';
import type { CompanyInfo, TenantRepository } from '../tenants/tenantRepository.js';

/**
 * IN-18/§5.7.2 — aloca uma inscrição recebida num grupo escolhido pelo admin. Cria ou
 * reaproveita o cliente por CPF (IN-03, sem sobrescrever), cria os acompanhantes
 * vinculados, e delega ao núcleo `allocateBooking` a criação do booking `pending` com o
 * snapshot congelado pela data de início daquele grupo. Marca o intake como `allocated`.
 *
 * **Tudo numa transação única** (UnitOfWork): criar/reaproveitar cliente, criar o booking,
 * marcar o intake e gravar o aceite ou falham juntos — sem cliente órfão nem inscrição sem
 * aceite. Só a equipe aloca. A inscrição precisa estar em `needs_allocation`.
 */

export interface AllocateFromQueueDeps {
  readonly uow: UnitOfWork;
  readonly clock: () => Date;
  /** DOC-08: identidade da empresa (nome + CNPJ) para o snapshot do Termo. */
  readonly tenants: TenantRepository;
}

export interface AllocateFromQueueCommand {
  readonly intakeId: string;
  readonly groupId: string;
}

export interface AllocatedFromQueue {
  readonly intakeId: string;
  readonly bookingId: string;
  readonly responsibleCustomerId: string;
  readonly participantCount: number;
}

export async function allocateFromQueue(
  deps: AllocateFromQueueDeps,
  ctx: RequestContext,
  command: AllocateFromQueueCommand,
): Promise<AllocatedFromQueue> {
  requireWriter(ctx);

  const actor = ctx.actor;

  // A identidade da empresa é dado de referência — lê fora da transação de escrita.
  const company = await deps.tenants.getCompanyInfo(ctx.tenantId);

  return deps.uow.run(ctx, (repos) =>
    allocateWithin(repos, deps.clock, ctx, command, actor.userId, company),
  );
}

async function allocateWithin(
  repos: AllocationRepositories,
  clock: () => Date,
  ctx: RequestContext,
  command: AllocateFromQueueCommand,
  allocatedBy: string,
  company: CompanyInfo,
): Promise<AllocatedFromQueue> {
  const intake = await repos.intake.findForAllocation(ctx.tenantId, command.intakeId);
  if (!intake) {
    throw new NotFoundError('inscrição recebida');
  }
  if (intake.status !== 'needs_allocation') {
    throw new BusinessRuleError('not_allocatable', 'Inscrição não está aguardando alocação');
  }

  const group = await repos.schedule.findGroupById(ctx.tenantId, command.groupId);
  if (!group) {
    throw new NotFoundError('grupo');
  }

  // O pedido do portal já traz os clientes escolhidos (§5.8): nada a criar nem a casar
  // por CPF, e a origem `portal` precisa sobreviver — é ela que preserva o cashback (CB-09).
  const portal = portalEnrollmentOf(intake.payload, intake.source);
  const responsibleId = portal
    ? portal.headCustomerId
    : await resolveResponsible(repos, ctx.tenantId, intake.normalized);
  const companionIds = portal
    ? portal.participantCustomerIds.filter((id) => id !== portal.headCustomerId)
    : await resolveCompanions(repos, ctx.tenantId, responsibleId, intake.normalized);

  const allocated = await allocateBooking(
    {
      bookings: repos.bookings,
      schedule: repos.schedule,
      itineraries: repos.itineraries,
      customers: repos.customers,
      cashback: repos.cashback,
    },
    ctx,
    {
      groupId: command.groupId,
      responsibleCustomerId: responsibleId,
      participantCustomerIds: [responsibleId, ...companionIds],
      // Formulário externo → `webhook` (sem cashback); pedido do app → `portal` (com).
      source: portal ? 'portal' : 'webhook',
    },
  );

  await repos.intake.markAllocated(ctx.tenantId, command.intakeId, {
    groupId: command.groupId,
    bookingId: allocated.booking.id,
    allocatedBy,
    allocatedAt: clock(),
  });

  // DOC-04/§5.7.1: o `aceite="1"` do formulário vira um aceite do Termo vigente agora que
  // o cliente existe. A data é a do envio do formulário (`submitted`), não a da alocação.
  // DOC-08: congela os valores das variáveis no aceite (contrato reconstruível sob demanda).
  const itinerary = await repos.itineraries.findById(ctx.tenantId, group.group.itineraryId);
  const variables = resolveTermVariables({
    customerName: intake.normalized.responsible.fullName,
    customerCpf: intake.normalized.responsible.cpf,
    itineraryName: itinerary?.name ?? null,
    startDate: group.event.startDate,
    endDate: group.event.endDate,
    participantNames: [
      intake.normalized.responsible.fullName,
      ...intake.normalized.companions.map((c) => c.fullName),
    ],
    totalCents: allocated.totalCents,
    companyName: company.name,
    companyCnpj: company.cnpj,
  });
  await captureTermAcceptance(repos, ctx.tenantId, clock, {
    customerId: responsibleId,
    bookingId: allocated.booking.id,
    normalized: intake.normalized,
    variables,
  });

  return {
    intakeId: command.intakeId,
    bookingId: allocated.booking.id,
    responsibleCustomerId: responsibleId,
    participantCount: 1 + companionIds.length,
  };
}

/**
 * Materializa o aceite do Termo capturado no formulário do site (`aceite="1"`). No-op se
 * o cliente não aceitou, se não há Termo publicado, ou se ele já aceitou a versão vigente
 * (idempotente — o cliente pode ter aceitado antes pelo portal). Canal `site`, data do envio.
 */
async function captureTermAcceptance(
  repos: AllocationRepositories,
  tenantId: string,
  clock: () => Date,
  input: {
    customerId: string;
    bookingId: string;
    normalized: MappedIntake;
    variables: Record<string, string>;
  },
): Promise<void> {
  if (!input.normalized.consent) return;
  const doc = await repos.documents.ensureTermDocument(tenantId, TERM_DOCUMENT_NAME);
  const current = await repos.documents.getCurrentPublished(tenantId, doc.id);
  if (!current) return;
  const accepted = await repos.documents.listAcceptedVersionNumbers(
    tenantId,
    doc.id,
    input.customerId,
  );
  if (accepted.includes(current.versionNumber)) return;
  await repos.documents.recordAcceptance({
    tenantId,
    documentVersionId: current.id,
    customerId: input.customerId,
    bookingId: input.bookingId,
    acceptedAt: parseSubmitted(input.normalized.submitted) ?? clock(),
    channel: 'site',
    ip: null,
    userAgent: null,
    pdfPath: null,
    variables: input.variables,
  });
}

/** `submitted` é ISO com offset (§5.7.1). Inválido/ausente → cai no relógio do servidor. */
function parseSubmitted(submitted: string | null): Date | null {
  if (submitted === null) return null;
  const date = new Date(submitted);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** IN-03: reaproveita por CPF; nunca sobrescreve o cadastro existente. */
async function resolveResponsible(
  repos: AllocationRepositories,
  tenantId: string,
  normalized: MappedIntake,
): Promise<string> {
  const cpf = parseCpf(String(normalized.responsible.cpf));
  const existing = await repos.customers.findByCpf(tenantId, cpf);
  if (existing) {
    // IN-04: dado divergente do cadastro entra na fila de revisão, sem sobrescrever.
    await enqueueDivergence(
      repos,
      tenantId,
      existing,
      {
        fullName: normalized.responsible.fullName,
        birthDate: normalized.responsible.birthDate,
        email: normalized.responsible.email,
        phone: normalized.responsible.phone,
      },
      divergenceReason(normalized),
    );
    return existing.id;
  }

  const data: NewCustomer = {
    tenantId,
    responsibleId: null,
    fullName: normalized.responsible.fullName,
    cpf,
    birthDate: normalized.responsible.birthDate,
    email: normalized.responsible.email,
    phone: normalized.responsible.phone,
    address: { ...EMPTY_ADDRESS, ...normalized.address },
  };
  const created = await repos.customers.create(data);
  return created.id;
}

function divergenceReason(normalized: MappedIntake): string {
  return `Divergência na inscrição ${normalized.formId}:${normalized.entryId} (IN-04)`;
}

/**
 * IN-04 — o CPF já existe e chegou com nome, nascimento, telefone ou e-mail diferentes.
 * Registra a divergência como pedido `pending` na fila de revisão (sem `requestedBy`) em
 * vez de sobrescrever. A equipe aprova (aplica) ou descarta. No-op se nada de fato
 * divergiu — só formatação/caixa não conta. Vale para o responsável e para o acompanhante
 * (que não tem contato, só nome e nascimento).
 */
async function enqueueDivergence(
  repos: AllocationRepositories,
  tenantId: string,
  existing: CustomerRecord,
  incoming: CustomerFacts,
  reason: string,
): Promise<void> {
  const divergence = detectCustomerDivergence(
    {
      fullName: existing.fullName,
      birthDate: existing.birthDate,
      email: existing.email,
      phone: existing.phone,
    },
    incoming,
  );
  if (!hasDivergence(divergence)) return;

  await repos.identityRequests.create({
    tenantId,
    customerId: existing.id,
    requestedBy: null,
    fullName: divergence.fullName,
    cpf: null,
    birthDate: divergence.birthDate,
    email: divergence.email,
    phone: divergence.phone,
    reason,
  });
}

async function resolveCompanions(
  repos: AllocationRepositories,
  tenantId: string,
  responsibleId: string,
  normalized: MappedIntake,
): Promise<string[]> {
  const ids: string[] = [];
  for (const companion of normalized.companions) {
    const cpf = parseCpf(String(companion.cpf));
    const existing = await repos.customers.findByCpf(tenantId, cpf);
    if (existing) {
      // IN-04: acompanhante conhecido com nome/nascimento diferente → fila de revisão.
      await enqueueDivergence(
        repos,
        tenantId,
        existing,
        {
          fullName: companion.fullName,
          birthDate: companion.birthDate,
          email: null,
          phone: null,
        },
        divergenceReason(normalized),
      );
      ids.push(existing.id);
      continue;
    }
    const created = await repos.customers.create({
      tenantId,
      responsibleId,
      fullName: companion.fullName,
      cpf,
      birthDate: companion.birthDate,
      email: null,
      phone: null,
      address: EMPTY_ADDRESS,
    });
    ids.push(created.id);
  }
  return ids;
}

/**
 * Reconhece o pedido feito pelo cliente no app. Só a origem `portal` com o payload no
 * formato esperado entra por aqui — qualquer outra coisa segue o caminho do formulário.
 */
function portalEnrollmentOf(payload: unknown, source: string): PortalEnrollmentPayload | null {
  if (source !== 'portal') return null;
  const candidate = payload as Partial<PortalEnrollmentPayload> | null;
  if (!candidate || candidate.kind !== PORTAL_ENROLLMENT_KIND) return null;
  if (!candidate.headCustomerId || !Array.isArray(candidate.participantCustomerIds)) return null;
  return {
    kind: PORTAL_ENROLLMENT_KIND,
    groupId: candidate.groupId ?? '',
    headCustomerId: candidate.headCustomerId,
    participantCustomerIds: candidate.participantCustomerIds,
  };
}

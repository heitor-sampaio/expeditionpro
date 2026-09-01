import { sumCents, zeroCents, type Cents, type LocalDate } from '@expedition/domain';
import { NotFoundError } from '../errors.js';
import { assertActorManagesCustomer } from '../portal/familyScope.js';
import type { RequestContext } from '../context.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { PaymentRepository } from '../payments/paymentRepository.js';
import type { CashbackRepository } from '../cashback/cashbackRepository.js';
import type { CashbackEntryRecord } from '../cashback/cashbackRepository.js';
import type { CustomerRecord, CustomerRepository } from './customerRepository.js';

/**
 * CL-06 — a ficha do cliente. Reúne as três abas: as saídas em que participou
 * (como responsável ou acompanhante), o financeiro de cada uma (contratado,
 * recebido e a receber sempre derivados, nunca coluna) e o extrato de cashback
 * (saldo = SUM do ledger). A equipe lê qualquer ficha do tenant; o cliente (portal)
 * lê só a da própria família — o mesmo guarda da escrita do portal (PC-05).
 */

export interface GetCustomerFileDeps {
  readonly customers: CustomerRepository;
  readonly bookings: BookingRepository;
  readonly schedule: ScheduleRepository;
  readonly payments: PaymentRepository;
  readonly cashback: CashbackRepository;
}

export interface GetCustomerFileCommand {
  readonly customerId: string;
}

export interface CustomerFileHeader {
  readonly id: string;
  readonly fullName: string;
  readonly cpf: CustomerRecord['cpf'];
  readonly birthDate: LocalDate;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: CustomerRecord['address'];
  readonly role: 'responsible' | 'companion';
}

export interface CustomerFileExpedition {
  readonly bookingId: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly status: string;
  readonly role: 'responsible' | 'companion';
  readonly participantCount: number;
  readonly contractedCents: number;
  readonly receivedCents: number;
  readonly dueCents: number;
  /** GR-14: quando a família embarcou; null enquanto não houve check-in. */
  readonly checkedInAt: Date | null;
}

export interface CustomerFileCashback {
  readonly balanceCents: number;
  readonly entries: readonly CashbackEntryRecord[];
}

export interface CustomerFileMember {
  readonly id: string;
  readonly fullName: string;
}

/**
 * A família vista da ficha: quem é o responsável acima (nulo quando o próprio cliente
 * é o responsável) e os demais acompanhantes da família — sempre sem o próprio cliente.
 * É o que as ações de vínculo (CL-10) e o merge (CL-07) precisam saber antes de agir.
 */
export interface CustomerFileFamily {
  readonly responsible: CustomerFileMember | null;
  readonly companions: readonly CustomerFileMember[];
}

export interface CustomerFile {
  readonly customer: CustomerFileHeader;
  readonly family: CustomerFileFamily;
  readonly expeditions: readonly CustomerFileExpedition[];
  readonly cashback: CustomerFileCashback;
}

export async function getCustomerFile(
  deps: GetCustomerFileDeps,
  ctx: RequestContext,
  command: GetCustomerFileCommand,
): Promise<CustomerFile> {
  await assertActorManagesCustomer(deps.customers, ctx, command.customerId);

  const customer = await deps.customers.findById(ctx.tenantId, command.customerId);
  if (!customer) {
    throw new NotFoundError('cliente');
  }

  const bookings = await deps.bookings.listByCustomer(ctx.tenantId, command.customerId);
  const expeditions = await Promise.all(
    bookings.map((booking) => toExpedition(deps, ctx, booking, command.customerId)),
  );

  const balanceCents = await deps.cashback.balance(ctx.tenantId, command.customerId);
  const entries = await deps.cashback.listByCustomer(ctx.tenantId, command.customerId);

  return {
    customer: toHeader(customer),
    family: await toFamily(deps, ctx, customer),
    expeditions: expeditions.filter((e): e is CustomerFileExpedition => e !== null),
    cashback: { balanceCents, entries },
  };
}

async function toFamily(
  deps: GetCustomerFileDeps,
  ctx: RequestContext,
  customer: CustomerRecord,
): Promise<CustomerFileFamily> {
  // A família é sempre de dois níveis (CL-11): o "head" é o responsável do cliente
  // ou ele mesmo, e os acompanhantes penduram todos nesse head.
  const headId = customer.responsibleId ?? customer.id;
  const head =
    customer.responsibleId === null
      ? null
      : await deps.customers.findById(ctx.tenantId, customer.responsibleId);
  const companions = await deps.customers.listByResponsible(ctx.tenantId, headId);

  return {
    responsible: head ? toMember(head) : null,
    companions: companions.filter((c) => c.id !== customer.id).map(toMember),
  };
}

function toMember(customer: CustomerRecord): CustomerFileMember {
  return { id: customer.id, fullName: customer.fullName };
}

async function toExpedition(
  deps: GetCustomerFileDeps,
  ctx: RequestContext,
  booking: Awaited<ReturnType<BookingRepository['listByCustomer']>>[number],
  customerId: string,
): Promise<CustomerFileExpedition | null> {
  const context = await deps.schedule.findGroupById(ctx.tenantId, booking.groupId);
  if (!context) {
    return null;
  }

  const contracted = sumCents(booking.participants.map((p) => p.unitPriceCents));
  const payments = await deps.payments.listByBooking(ctx.tenantId, booking.id);
  const received = sumCents(payments.map((p) => p.amountCents));
  const due = booking.status === 'cancelled' ? zeroCents : subtractDue(contracted, received);

  return {
    bookingId: booking.id,
    groupId: booking.groupId,
    groupName: context.group.name,
    startDate: context.event.startDate,
    endDate: context.event.endDate,
    status: booking.status,
    role: booking.responsibleCustomerId === customerId ? 'responsible' : 'companion',
    participantCount: booking.participants.length,
    contractedCents: contracted,
    receivedCents: received,
    dueCents: due,
    checkedInAt: booking.checkedInAt,
  };
}

function subtractDue(contracted: Cents, received: Cents): Cents {
  const diff = contracted - received;
  return (diff > 0 ? diff : 0) as Cents;
}

function toHeader(customer: CustomerRecord): CustomerFileHeader {
  return {
    id: customer.id,
    fullName: customer.fullName,
    cpf: customer.cpf,
    birthDate: customer.birthDate,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    role: customer.responsibleId === null ? 'responsible' : 'companion',
  };
}

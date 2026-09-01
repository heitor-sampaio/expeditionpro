import { requireWriter } from '../audience.js';
import {
  normalizeCep,
  normalizePersonName,
  parseCpf,
  parseLocalDate,
  parsePhone,
} from '@expedition/domain';
import { ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import { DuplicateCpfError } from './errors.js';
import { EMPTY_ADDRESS } from './customerRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { Address, CustomerRecord, CustomerRepository } from './customerRepository.js';
import type { AddressInput } from './registerCustomer.js';

/**
 * CL-06 — a equipe edita a ficha inteira do cliente, responsável ou acompanhante.
 *
 * É o caminho autoritário: pelo portal o cliente edita só contato (PC-06) e **pede**
 * mudança de identidade (PC-07). Aqui a equipe aplica direto — e por isso identidade
 * (nome, CPF, nascimento) exige owner/admin, o mesmo peso da decisão da fila, já que
 * define preço e nota.
 *
 * Campo ausente preserva o valor atual; e-mail e telefone em branco limpam (menos no
 * responsável, que o §3.2 exige preenchido). Uma escrita só, para não deixar a ficha
 * meio salva.
 */

export interface UpdateCustomerCommand {
  readonly customerId: string;
  readonly fullName?: string | undefined;
  readonly cpf?: string | undefined;
  readonly birthDate?: string | undefined; // ISO YYYY-MM-DD
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly address?: AddressInput | undefined;
}

export interface UpdateCustomerDeps {
  readonly customers: CustomerRepository;
  readonly audit: AuditLogRepository;
}

const IDENTITY_ROLES = new Set(['owner', 'admin']);

export async function updateCustomer(
  deps: UpdateCustomerDeps,
  ctx: RequestContext,
  command: UpdateCustomerCommand,
): Promise<CustomerRecord> {
  requireWriter(ctx);

  const { actor } = ctx;

  const current = await deps.customers.findById(ctx.tenantId, command.customerId);
  if (!current) throw new NotFoundError('cliente');

  const fullName =
    command.fullName !== undefined ? normalizePersonName(command.fullName) : current.fullName;
  if (fullName.length === 0) throw new RequiredFieldError('fullName');

  const cpf = command.cpf !== undefined ? parseCpf(command.cpf) : current.cpf;
  const birthDate =
    command.birthDate !== undefined ? parseLocalDate(command.birthDate) : current.birthDate;

  const touchesIdentity =
    fullName !== current.fullName || cpf !== current.cpf || !sameDate(birthDate, current.birthDate);
  if (touchesIdentity && !IDENTITY_ROLES.has(actor.role)) {
    throw new ForbiddenError('Alterar identidade exige owner ou admin');
  }

  if (cpf !== current.cpf) {
    const existing = await deps.customers.findByCpf(ctx.tenantId, cpf);
    if (existing && existing.id !== current.id) throw new DuplicateCpfError();
  }

  const email = command.email !== undefined ? blankToNull(command.email) : current.email;
  const phone = command.phone !== undefined ? normalizePhone(command.phone) : current.phone;
  // §3.2 — o responsável é a chave de login e o canal de contato da família.
  if (current.responsibleId === null) {
    if (!email) throw new RequiredFieldError('email');
    if (!phone) throw new RequiredFieldError('phone');
  }

  const address = command.address !== undefined ? toAddress(command.address) : current.address;

  const changed = changedFields(current, { fullName, cpf, birthDate, email, phone, address });
  if (changed.length === 0) return current;

  const updated = await deps.customers.updateProfile(ctx.tenantId, current.id, {
    fullName,
    cpf,
    birthDate,
    email,
    phone,
    address,
  });

  // A trilha guarda **quais** campos mudaram, não os valores: auditoria é dado de
  // equipe, mas não precisa virar uma segunda cópia do cadastro (SEC-04).
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'customer',
    entityId: current.id,
    action: 'customer.update',
    diff: { fields: changed },
  });

  return updated;
}

type Profile = Pick<
  CustomerRecord,
  'fullName' | 'cpf' | 'birthDate' | 'email' | 'phone' | 'address'
>;

function changedFields(current: CustomerRecord, next: Profile): string[] {
  const fields: string[] = [];
  if (next.fullName !== current.fullName) fields.push('fullName');
  if (next.cpf !== current.cpf) fields.push('cpf');
  if (!sameDate(next.birthDate, current.birthDate)) fields.push('birthDate');
  if (next.email !== current.email) fields.push('email');
  if (next.phone !== current.phone) fields.push('phone');
  if (!sameAddress(next.address, current.address)) fields.push('address');
  return fields;
}

function sameDate(a: CustomerRecord['birthDate'], b: CustomerRecord['birthDate']): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function sameAddress(a: Address, b: Address): boolean {
  return (
    a.street === b.street &&
    a.number === b.number &&
    a.district === b.district &&
    a.city === b.city &&
    a.state === b.state &&
    a.zip === b.zip
  );
}

/** Telefone em branco limpa; senão normaliza para E.164 (§3.2). */
function normalizePhone(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? parsePhone(trimmed) : null;
}

function toAddress(input: AddressInput): Address {
  const zip = input.zip ? normalizeCep(input.zip) : '';
  return {
    ...EMPTY_ADDRESS,
    street: blankToNull(input.street ?? ''),
    number: blankToNull(input.number ?? ''),
    district: blankToNull(input.district ?? ''),
    city: blankToNull(input.city ?? ''),
    state: input.state ? input.state.trim().toUpperCase().slice(0, 2) : null,
    zip: zip ? zip : null,
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

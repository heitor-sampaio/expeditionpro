import { requireWriter } from '../audience.js';
import {
  normalizeCep,
  normalizePersonName,
  parseCpf,
  parseLocalDate,
  parsePhone,
} from '@expedition/domain';
import { RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';
import { EMPTY_ADDRESS } from './customerRepository.js';
import type { Address, CustomerRecord, CustomerRepository } from './customerRepository.js';
import { DuplicateCpfError } from './errors.js';

export interface AddressInput {
  readonly street?: string | undefined;
  readonly number?: string | undefined;
  readonly district?: string | undefined;
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly zip?: string | undefined;
}

/**
 * CL-01 — cadastra um cliente responsável (responsible_id = null).
 *
 * Faz o parse do domínio na entrada (CPF e nascimento viram value objects; entrada
 * inválida lança antes de qualquer escrita), exige os campos obrigatórios do
 * responsável (§3.2: e-mail e telefone, além de nome/CPF/nascimento), garante a
 * unicidade por tenant e delega ao port. Sem I/O próprio: orquestra, não conhece Prisma.
 */

export interface RegisterCustomerCommand {
  readonly fullName: string;
  readonly cpf: string;
  readonly birthDate: string; // ISO YYYY-MM-DD
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly address?: AddressInput | undefined;
}

export interface RegisterCustomerDeps {
  readonly customers: CustomerRepository;
}

export async function registerCustomer(
  deps: RegisterCustomerDeps,
  ctx: RequestContext,
  command: RegisterCustomerCommand,
): Promise<CustomerRecord> {
  requireWriter(ctx);
  const cpf = parseCpf(command.cpf);
  const birthDate = parseLocalDate(command.birthDate);

  // §3.2 — o responsável exige e-mail (chave de login) e telefone (canal de contato).
  const email = blankToNull(command.email);
  if (!email) throw new RequiredFieldError('email');
  const rawPhone = blankToNull(command.phone);
  if (!rawPhone) throw new RequiredFieldError('phone');
  const phone = parsePhone(rawPhone); // normaliza para E.164 (§3.2)

  const existing = await deps.customers.findByCpf(ctx.tenantId, cpf);
  if (existing) throw new DuplicateCpfError();

  return deps.customers.create({
    tenantId: ctx.tenantId,
    responsibleId: null,
    fullName: normalizePersonName(command.fullName),
    cpf,
    birthDate,
    email,
    phone,
    address: toAddress(command.address),
  });
}

function toAddress(input: AddressInput | undefined): Address {
  if (!input) return EMPTY_ADDRESS;
  const zip = input.zip ? normalizeCep(input.zip) : '';
  return {
    street: blankToNull(input.street),
    number: blankToNull(input.number),
    district: blankToNull(input.district),
    city: blankToNull(input.city),
    state: blankToNull(input.state),
    zip: zip || null,
  };
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

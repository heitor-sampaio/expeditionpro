import { normalizeCep, parsePhone } from '@expedition/domain';
import { NotFoundError } from '../errors.js';
import { assertActorManagesCustomer } from './familyScope.js';
import type { RequestContext } from '../context.js';
import type {
  Address,
  CustomerRecord,
  CustomerRepository,
} from '../customers/customerRepository.js';

/**
 * PC-06 — edição livre de contato e endereço, pelo próprio cliente (ou pela equipe).
 * **Nunca** toca nome, CPF ou data de nascimento (PC-07: identidade define preço e
 * nota, e vai para a fila de aprovação, não por aqui). Escopo de família: o cliente só
 * edita a si e à própria família.
 */

export interface UpdateCustomerContactDeps {
  readonly customers: CustomerRepository;
}

export interface UpdateCustomerContactCommand {
  readonly customerId: string;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly address?: Address | undefined;
}

export async function updateCustomerContact(
  deps: UpdateCustomerContactDeps,
  ctx: RequestContext,
  command: UpdateCustomerContactCommand,
): Promise<CustomerRecord> {
  await assertActorManagesCustomer(deps.customers, ctx, command.customerId);

  const current = await deps.customers.findById(ctx.tenantId, command.customerId);
  if (!current) throw new NotFoundError('cliente');

  return deps.customers.updateContact(ctx.tenantId, command.customerId, {
    email: command.email !== undefined ? blankToNull(command.email) : current.email,
    phone: command.phone !== undefined ? normalizePhone(command.phone) : current.phone,
    address: command.address !== undefined ? normalizeAddress(command.address) : current.address,
  });
}

/** Telefone em branco limpa; senão normaliza para E.164 (§3.2). */
function normalizePhone(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? parsePhone(trimmed) : null;
}

/** CEP só dígitos (§5.7.1); demais campos aparados. */
function normalizeAddress(address: Address): Address {
  return {
    street: blankToNull(address.street ?? ''),
    number: blankToNull(address.number ?? ''),
    district: blankToNull(address.district ?? ''),
    city: blankToNull(address.city ?? ''),
    state: address.state ? address.state.trim().toUpperCase().slice(0, 2) : null,
    zip: address.zip ? normalizeCep(address.zip) || null : null,
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

import { fullYearsBetween, type LocalDate } from '@expedition/domain';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { AuthAdminGateway, InvitedUser } from '../team/authAdminGateway.js';

/**
 * PC-01/PC-02 — convida um cliente para o portal. Cria o usuário no Supabase Auth com
 * `app_metadata.{tenant_id, role: customer, customer_id}` (o que a RLS e o roteamento do
 * front leem) e liga a conta ao cliente (`auth_user_id` + `portal_status`). Elegível =
 * **adulto com e-mail próprio** (o magic link precisa do e-mail). Só owner/admin.
 */

const MIN_AGE = 18;

export interface InvitePortalCustomerDeps {
  readonly customers: CustomerRepository;
  readonly authAdmin: AuthAdminGateway;
  readonly clock: () => Date;
}

export interface InvitePortalCustomerCommand {
  readonly customerId: string;
}

export async function invitePortalCustomer(
  deps: InvitePortalCustomerDeps,
  ctx: RequestContext,
  command: InvitePortalCustomerCommand,
): Promise<InvitedUser> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Convidar ao portal exige owner ou admin');
  }

  const customer = await deps.customers.findById(ctx.tenantId, command.customerId);
  if (!customer) throw new NotFoundError('cliente');

  const email = customer.email?.trim();
  if (!email) {
    throw new BusinessRuleError('no_email', 'Cliente sem e-mail não pode ser convidado ao portal');
  }
  if (fullYearsBetween(customer.birthDate, today(deps.clock())) < MIN_AGE) {
    throw new BusinessRuleError('not_adult', 'Só maiores de 18 têm acesso ao portal (PC-01)');
  }

  const invited = await deps.authAdmin.invitePortalCustomer({
    email,
    tenantId: ctx.tenantId,
    customerId: customer.id,
  });
  await deps.customers.linkAuthUser(ctx.tenantId, customer.id, invited.userId, 'invited');
  return invited;
}

function today(now: Date): LocalDate {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
}

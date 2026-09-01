import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeAuthAdminGateway } from '../team/authAdminGateway.fake.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import { invitePortalCustomer } from './invitePortalCustomer.js';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

const TENANT = 'tenant-a';
const CLOCK = () => new Date('2026-08-25T12:00:00Z');

const owner: RequestContext = {
  tenantId: TENANT,
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

async function makeCustomer(
  customers: ReturnType<typeof fakeCustomerRepository>,
  over: { birthDate?: string; email?: string | null } = {},
) {
  return customers.create({
    tenantId: TENANT,
    responsibleId: null,
    fullName: 'Ana',
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate(over.birthDate ?? '1985-01-01'),
    email: over.email === undefined ? 'ana@ex.com' : over.email,
    phone: null,
    address: EMPTY_ADDRESS,
  });
}

describe('PC-01/PC-02: convite do cliente ao portal', () => {
  it('convida um cliente elegível: grava tenant+customer no metadata e liga a conta', async () => {
    const customers = fakeCustomerRepository();
    const authAdmin = fakeAuthAdminGateway();
    const customer = await makeCustomer(customers);

    const result = await invitePortalCustomer(
      { customers, authAdmin, audit: fakeAuditLogRepository(), clock: CLOCK },
      owner,
      {
        customerId: customer.id,
      },
    );

    expect(result.actionLink).toBeTruthy();
    expect(authAdmin.portalInvites).toHaveLength(1);
    expect(authAdmin.portalInvites[0]!.tenantId).toBe(TENANT); // do contexto
    expect(authAdmin.portalInvites[0]!.customerId).toBe(customer.id);
    expect(authAdmin.portalInvites[0]!.email).toBe('ana@ex.com');
  });

  it('cliente sem e-mail não pode ser convidado (magic link precisa do e-mail)', async () => {
    const customers = fakeCustomerRepository();
    const authAdmin = fakeAuthAdminGateway();
    const customer = await makeCustomer(customers, { email: null });
    await expect(
      invitePortalCustomer(
        { customers, authAdmin, audit: fakeAuditLogRepository(), clock: CLOCK },
        owner,
        {
          customerId: customer.id,
        },
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('menor de 18 não é elegível (PC-01)', async () => {
    const customers = fakeCustomerRepository();
    const authAdmin = fakeAuthAdminGateway();
    const customer = await makeCustomer(customers, { birthDate: '2013-01-01' });
    await expect(
      invitePortalCustomer(
        { customers, authAdmin, audit: fakeAuditLogRepository(), clock: CLOCK },
        owner,
        {
          customerId: customer.id,
        },
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('convidar exige owner/admin (operator recusado)', async () => {
    const customers = fakeCustomerRepository();
    const authAdmin = fakeAuthAdminGateway();
    const customer = await makeCustomer(customers);
    await expect(
      invitePortalCustomer(
        { customers, authAdmin, audit: fakeAuditLogRepository(), clock: CLOCK },
        { tenantId: TENANT, actor: { kind: 'team', userId: 'u2', role: 'operator' } },
        { customerId: customer.id },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente inexistente é recusado', async () => {
    const customers = fakeCustomerRepository();
    const authAdmin = fakeAuthAdminGateway();
    await expect(
      invitePortalCustomer(
        { customers, authAdmin, audit: fakeAuditLogRepository(), clock: CLOCK },
        owner,
        {
          customerId: 'nao-existe',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from './audit/auditLogRepository.fake.js';
import { fakeCustomerRepository } from './customers/customerRepository.fake.js';
import { fakeIdentityChangeRepository } from './identity/identityChangeRepository.fake.js';
import { decideIdentityChange } from './identity/decideIdentityChange.js';
import { inviteTeamMember } from './team/inviteTeamMember.js';
import { invitePortalCustomer } from './portal/invitePortalCustomer.js';
import { requestIdentityChange } from './identity/requestIdentityChange.js';
import { EMPTY_ADDRESS } from './customers/customerRepository.js';
import { parseCpf, parseLocalDate } from '@expedition/domain';
import type { AuthAdminGateway } from './team/authAdminGateway.js';
import type { RequestContext } from './context.js';

/**
 * A09 — quem ganha acesso e quem tem a identidade alterada deixa rastro.
 *
 * A auditoria de segurança apontou a lacuna com precisão: `updateCustomer` grava trilha
 * quando a equipe corrige nome ou CPF pelo back-office, mas o **caminho de aprovação** —
 * que é como a mudança realmente acontece quando o pedido vem do cliente (PC-07) — não
 * gravava nada. E convite de equipe e de portal **criam conta de acesso** sem registrar
 * quem convidou nem quem foi convidado.
 *
 * São exatamente as duas coisas que o A09 pede auditadas: alteração de dado de identidade
 * e concessão de acesso.
 */

const owner: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

const clock = () => new Date('2026-09-01T12:00:00Z');

const convidado = { userId: 'auth-novo', actionLink: 'https://magic/link' };
const authAdmin: AuthAdminGateway = {
  inviteTeamMember: () => Promise.resolve(convidado),
  invitePortalCustomer: () => Promise.resolve(convidado),
};

async function comCliente() {
  const customers = fakeCustomerRepository();
  const cliente = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: null,
    fullName: 'Ana Prado',
    cpf: parseCpf('900.000.100-57'),
    birthDate: parseLocalDate('1990-03-04'),
    email: 'ana@example.com',
    phone: '5548999998877',
    address: EMPTY_ADDRESS,
  });
  return { customers, cliente, audit: fakeAuditLogRepository() };
}

describe('A09: mudança de identidade aprovada deixa trilha', () => {
  it('PC-07: aprovar grava quem decidiu e o que mudou', async () => {
    const s = await comCliente();
    const identityRequests = fakeIdentityChangeRepository();
    const pedido = await requestIdentityChange(
      { customers: s.customers, identityRequests, clock },
      { tenantId: 'tenant-a', actor: { kind: 'customer', userId: 'a', customerId: s.cliente.id } },
      { customerId: s.cliente.id, fullName: 'Ana Prado Gonçalves' },
    );

    await decideIdentityChange(
      { customers: s.customers, identityRequests, audit: s.audit, clock },
      owner,
      { requestId: pedido.id, approve: true },
    );

    const trilha = s.audit.rows.find((r) => r.action === 'identity_change.decide');
    expect(trilha).toMatchObject({ entity: 'identity_change_request', actorUserId: 'u1' });
    expect(trilha?.diff).toMatchObject({ decision: 'approved', customerId: s.cliente.id });
  });

  it('recusar também grava — negar acesso a mudança é decisão tão auditável quanto conceder', async () => {
    const s = await comCliente();
    const identityRequests = fakeIdentityChangeRepository();
    const pedido = await requestIdentityChange(
      { customers: s.customers, identityRequests, clock },
      { tenantId: 'tenant-a', actor: { kind: 'customer', userId: 'a', customerId: s.cliente.id } },
      { customerId: s.cliente.id, fullName: 'Nome Falso' },
    );

    await decideIdentityChange(
      { customers: s.customers, identityRequests, audit: s.audit, clock },
      owner,
      { requestId: pedido.id, approve: false },
    );

    expect(s.audit.rows.find((r) => r.action === 'identity_change.decide')?.diff).toMatchObject({
      decision: 'rejected',
    });
  });
});

describe('A09: convite deixa trilha — cria conta de acesso', () => {
  it('§3.7: convite de equipe grava quem convidou, para qual e-mail e com qual papel', async () => {
    const audit = fakeAuditLogRepository();

    await inviteTeamMember({ authAdmin, audit }, owner, {
      email: 'novo@drakkar.com',
      role: 'operator',
    });

    const trilha = audit.rows.find((r) => r.action === 'team_member.invite');
    expect(trilha).toMatchObject({ entity: 'membership', actorUserId: 'u1' });
    expect(trilha?.diff).toMatchObject({ email: 'novo@drakkar.com', role: 'operator' });
  });

  it('PC-01: convite de portal grava o cliente convidado', async () => {
    const s = await comCliente();

    await invitePortalCustomer(
      { customers: s.customers, authAdmin, audit: s.audit, clock },
      owner,
      { customerId: s.cliente.id },
    );

    const trilha = s.audit.rows.find((r) => r.action === 'portal_customer.invite');
    expect(trilha).toMatchObject({ entity: 'customer', entityId: s.cliente.id });
  });
});

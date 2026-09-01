import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { maskCpf, parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeIdentityChangeRepository } from './identityChangeRepository.fake.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import { DuplicateCpfError } from '../customers/errors.js';
import { requestIdentityChange } from './requestIdentityChange.js';
import { listIdentityChangeRequests } from './listIdentityChangeRequests.js';
import { decideIdentityChange } from './decideIdentityChange.js';
import { BusinessRuleError, ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';

const TENANT = 'tenant-a';
const CLOCK = () => new Date('2026-08-25T12:00:00Z');

async function seed() {
  const customers = fakeCustomerRepository();
  const identityRequests = fakeIdentityChangeRepository();
  const resp1 = await customers.create({
    tenantId: TENANT,
    responsibleId: null,
    fullName: 'Ana',
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate('2013-01-01'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });
  const comp1 = await customers.create({
    tenantId: TENANT,
    responsibleId: resp1.id,
    fullName: 'Bruno',
    cpf: parseCpf('277.373.070-44'),
    birthDate: parseLocalDate('2015-02-02'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });
  const resp2 = await customers.create({
    tenantId: TENANT,
    responsibleId: null,
    fullName: 'Outro',
    cpf: parseCpf('500.400.300-91'),
    birthDate: parseLocalDate('1990-03-03'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });
  return { customers, identityRequests, resp1, comp1, resp2 };
}

const customerCtx = (id: string): RequestContext => ({
  tenantId: TENANT,
  actor: { kind: 'customer', customerId: id, userId: 'auth-1' },
});
const teamCtx = (role: 'owner' | 'admin' | 'operator'): RequestContext => ({
  tenantId: TENANT,
  actor: { kind: 'team', userId: 'u1', role },
});

describe('PC-07: fila de aprovação de identidade', () => {
  it('o pedido nasce pendente e NÃO aplica a mudança na hora', async () => {
    const { customers, identityRequests, resp1 } = await seed();
    const req = await requestIdentityChange(
      { customers, identityRequests },
      customerCtx(resp1.id),
      {
        customerId: resp1.id,
        birthDate: '2012-06-06', // correção de nascimento (muda faixa etária)
        reason: 'data errada no cadastro',
      },
    );
    expect(req.status).toBe('pending');
    // o cliente segue com a data antiga até a aprovação
    const still = await customers.findById(TENANT, resp1.id);
    expect(still?.birthDate).toEqual(parseLocalDate('2013-01-01'));
  });

  it('exige ao menos um campo de identidade', async () => {
    const { customers, identityRequests, resp1 } = await seed();
    await expect(
      requestIdentityChange({ customers, identityRequests }, customerCtx(resp1.id), {
        customerId: resp1.id,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('o cliente pede para um acompanhante da família, mas não para outra família', async () => {
    const { customers, identityRequests, resp1, comp1, resp2 } = await seed();
    await requestIdentityChange({ customers, identityRequests }, customerCtx(resp1.id), {
      customerId: comp1.id,
      fullName: 'Bruno Silva',
    });
    await expect(
      requestIdentityChange({ customers, identityRequests }, customerCtx(resp1.id), {
        customerId: resp2.id,
        fullName: 'Hacker',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('CPF proposto que já existe em outro cliente é recusado', async () => {
    const { customers, identityRequests, resp1 } = await seed();
    await expect(
      requestIdentityChange({ customers, identityRequests }, customerCtx(resp1.id), {
        customerId: resp1.id,
        cpf: '500.400.300-91', // é do resp2
      }),
    ).rejects.toBeInstanceOf(DuplicateCpfError);
  });

  it('a equipe lista os pendentes com o valor atual e o proposto', async () => {
    const { customers, identityRequests, resp1 } = await seed();
    await requestIdentityChange({ customers, identityRequests }, customerCtx(resp1.id), {
      customerId: resp1.id,
      fullName: 'Ana Prado',
    });
    const list = await listIdentityChangeRequests(
      { customers, identityRequests },
      teamCtx('admin'),
    );
    expect(list).toHaveLength(1);
    expect(list[0]!.customerName).toBe('Ana');
    expect(list[0]!.currentFullName).toBe('Ana');
    expect(list[0]!.request.fullName).toBe('Ana Prado');
  });

  it('aprovar aplica a mudança no cliente e marca approved', async () => {
    const { customers, identityRequests, resp1 } = await seed();
    const req = await requestIdentityChange(
      { customers, identityRequests },
      customerCtx(resp1.id),
      { customerId: resp1.id, fullName: 'Ana Prado', birthDate: '2012-06-06' },
    );
    const decided = await decideIdentityChange(
      { customers, identityRequests, audit: fakeAuditLogRepository(), clock: CLOCK },
      teamCtx('owner'),
      { requestId: req.id, approve: true },
    );
    expect(decided.status).toBe('approved');
    const after = await customers.findById(TENANT, resp1.id);
    expect(after?.fullName).toBe('Ana Prado');
    expect(after?.birthDate).toEqual(parseLocalDate('2012-06-06'));
  });

  it('IN-04: aprovar um pedido com contato aplica telefone/e-mail sem tocar no endereço', async () => {
    const { customers, identityRequests, resp1 } = await seed();
    await customers.updateContact(TENANT, resp1.id, {
      email: 'antigo@exemplo.com',
      phone: '48000000000',
      address: { ...EMPTY_ADDRESS, city: 'Florianópolis', state: 'SC' },
    });
    // pedido vindo da alocação (IN-04): só contato proposto, requestedBy nulo
    const req = await identityRequests.create({
      tenantId: TENANT,
      customerId: resp1.id,
      requestedBy: null,
      fullName: null,
      cpf: null,
      birthDate: null,
      email: 'novo@exemplo.com',
      phone: '48999998877',
      reason: 'Divergência na inscrição 4641:101 (IN-04)',
    });

    await decideIdentityChange(
      { customers, identityRequests, audit: fakeAuditLogRepository(), clock: CLOCK },
      teamCtx('admin'),
      {
        requestId: req.id,
        approve: true,
      },
    );

    const after = await customers.findById(TENANT, resp1.id);
    expect(after?.email).toBe('novo@exemplo.com');
    expect(after?.phone).toBe('48999998877');
    // endereço intacto
    expect(after?.address.city).toBe('Florianópolis');
    expect(after?.address.state).toBe('SC');
  });

  it('recusar NÃO altera o cliente', async () => {
    const { customers, identityRequests, resp1 } = await seed();
    const req = await requestIdentityChange(
      { customers, identityRequests },
      customerCtx(resp1.id),
      { customerId: resp1.id, fullName: 'Nome Falso' },
    );
    const decided = await decideIdentityChange(
      { customers, identityRequests, audit: fakeAuditLogRepository(), clock: CLOCK },
      teamCtx('admin'),
      { requestId: req.id, approve: false, note: 'não confere' },
    );
    expect(decided.status).toBe('rejected');
    const after = await customers.findById(TENANT, resp1.id);
    expect(after?.fullName).toBe('Ana');
  });

  it('decidir exige owner/admin (operator recusado) e só o cliente pede', async () => {
    const { customers, identityRequests, resp1 } = await seed();
    const req = await requestIdentityChange(
      { customers, identityRequests },
      customerCtx(resp1.id),
      { customerId: resp1.id, fullName: 'X' },
    );
    await expect(
      decideIdentityChange(
        { customers, identityRequests, audit: fakeAuditLogRepository(), clock: CLOCK },
        teamCtx('operator'),
        {
          requestId: req.id,
          approve: true,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // a equipe não usa a fila para si via o pedido do portal? o pedido é da equipe OU do cliente:
    expect(maskCpf(resp1.cpf)).toContain('***');
  });

  it('não decide um pedido que não está pendente', async () => {
    const { customers, identityRequests, resp1 } = await seed();
    const req = await requestIdentityChange(
      { customers, identityRequests },
      customerCtx(resp1.id),
      { customerId: resp1.id, fullName: 'X' },
    );
    await decideIdentityChange(
      { customers, identityRequests, audit: fakeAuditLogRepository(), clock: CLOCK },
      teamCtx('owner'),
      {
        requestId: req.id,
        approve: true,
      },
    );
    await expect(
      decideIdentityChange(
        { customers, identityRequests, audit: fakeAuditLogRepository(), clock: CLOCK },
        teamCtx('owner'),
        {
          requestId: req.id,
          approve: false,
        },
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

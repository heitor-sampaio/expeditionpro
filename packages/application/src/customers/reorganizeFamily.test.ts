import { describe, it, expect } from 'vitest';
import { NotFoundError, BusinessRuleError } from '../errors.js';
import { registerCustomer } from './registerCustomer.js';
import { registerCompanion } from './registerCompanion.js';
import { moveToResponsible } from './moveToResponsible.js';
import { promoteToResponsible } from './promoteToResponsible.js';
import { fakeCustomerRepository } from './customerRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import type { RequestContext } from '../context.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const audit = fakeAuditLogRepository();

async function family(customers: ReturnType<typeof fakeCustomerRepository>) {
  const contact = { email: 'x@ex.com', phone: '48999998877' };
  const r = await registerCustomer({ customers }, ctx, {
    fullName: 'Responsável',
    cpf: '90000010057',
    birthDate: '1980-01-01',
    ...contact,
  });
  const r2 = await registerCustomer({ customers }, ctx, {
    fullName: 'Outro Responsável',
    cpf: '12345678909',
    birthDate: '1980-01-01',
    ...contact,
  });
  const c1 = await registerCompanion({ customers }, ctx, {
    responsibleId: r.id,
    fullName: 'Filho 1',
    cpf: '52998224725',
    birthDate: '2015-03-22',
  });
  const c2 = await registerCompanion({ customers }, ctx, {
    responsibleId: r.id,
    fullName: 'Filho 2',
    cpf: '11144477735',
    birthDate: '2018-07-09',
  });
  return { r, r2, c1, c2 };
}

describe('CL-10: mover para outra família / vincular como acompanhante', () => {
  it('move um acompanhante para outro responsável', async () => {
    const customers = fakeCustomerRepository();
    const { r2, c1 } = await family(customers);
    const moved = await moveToResponsible({ customers, audit }, ctx, {
      customerId: c1.id,
      responsibleId: r2.id,
    });
    expect(moved.responsibleId).toBe(r2.id);
  });

  it('rejeita mover para um destino que não é responsável', async () => {
    const customers = fakeCustomerRepository();
    const { c1, c2 } = await family(customers);
    await expect(
      moveToResponsible({ customers, audit }, ctx, { customerId: c1.id, responsibleId: c2.id }),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('rejeita vincular um responsável que ainda tem acompanhantes', async () => {
    const customers = fakeCustomerRepository();
    const { r, r2 } = await family(customers); // r tem c1, c2
    await expect(
      moveToResponsible({ customers, audit }, ctx, { customerId: r.id, responsibleId: r2.id }),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('rejeita vincular a si mesmo', async () => {
    const customers = fakeCustomerRepository();
    const { r2 } = await family(customers);
    await expect(
      moveToResponsible({ customers, audit }, ctx, { customerId: r2.id, responsibleId: r2.id }),
    ).rejects.toThrow(BusinessRuleError);
  });
});

describe('CL-10: tornar responsável', () => {
  it('torna um acompanhante responsável (responsible_id = null)', async () => {
    const customers = fakeCustomerRepository();
    const { c1 } = await family(customers);
    const promoted = await promoteToResponsible({ customers, audit }, ctx, { customerId: c1.id });
    expect(promoted.responsibleId).toBeNull();
  });

  it('leva acompanhantes selecionados da família de origem', async () => {
    const customers = fakeCustomerRepository();
    const { c1, c2 } = await family(customers); // c1 e c2 são irmãos (mesmo responsável)
    await promoteToResponsible({ customers, audit }, ctx, {
      customerId: c1.id,
      bringCompanionIds: [c2.id],
    });
    const c2After = await customers.findById(ctx.tenantId, c2.id);
    expect(c2After?.responsibleId).toBe(c1.id);
  });

  it('rejeita levar quem não é da família de origem', async () => {
    const customers = fakeCustomerRepository();
    const { c1 } = await family(customers);
    const otherResp = await registerCustomer({ customers }, ctx, {
      fullName: 'Outra Família',
      cpf: '39053344705',
      birthDate: '1980-01-01',
      email: 'o@ex.com',
      phone: '48999998877',
    });
    const stranger = await registerCompanion({ customers }, ctx, {
      responsibleId: otherResp.id,
      fullName: 'Estranho',
      cpf: '15350946056',
      birthDate: '2019-01-01',
    });
    await expect(
      promoteToResponsible({ customers, audit }, ctx, {
        customerId: c1.id,
        bringCompanionIds: [stranger.id],
      }),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('rejeita cliente inexistente', async () => {
    const customers = fakeCustomerRepository();
    await expect(
      promoteToResponsible({ customers, audit }, ctx, { customerId: 'nao-existe' }),
    ).rejects.toThrow(NotFoundError);
  });
});

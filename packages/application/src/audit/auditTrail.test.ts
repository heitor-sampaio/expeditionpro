import { describe, it, expect } from 'vitest';
import { registerCustomer } from '../customers/registerCustomer.js';
import { registerCompanion } from '../customers/registerCompanion.js';
import { moveToResponsible } from '../customers/moveToResponsible.js';
import { promoteToResponsible } from '../customers/promoteToResponsible.js';
import { mergeCustomers } from '../customers/mergeCustomers.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeVehicleRepository } from '../vehicles/vehicleRepository.fake.js';
import { fakeAuditLogRepository } from './auditLogRepository.fake.js';
import type { RequestContext } from '../context.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'user-99', role: 'admin' },
};

const contact = { email: 'x@ex.com', phone: '48999998877' };

async function family(customers: ReturnType<typeof fakeCustomerRepository>) {
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
  return { r, r2, c1 };
}

describe('§3.2.1 · CL-10: reorganização de vínculo é auditada', () => {
  it('mover para outra família grava uma linha em audit_logs (de → para)', async () => {
    const customers = fakeCustomerRepository();
    const audit = fakeAuditLogRepository();
    const { r, r2, c1 } = await family(customers);

    await moveToResponsible({ customers, audit }, ctx, {
      customerId: c1.id,
      responsibleId: r2.id,
    });

    const trail = await audit.listByEntity(ctx.tenantId, 'customer', c1.id);
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({
      actorUserId: 'user-99',
      entity: 'customer',
      entityId: c1.id,
      action: 'family.move',
      diff: { from: r.id, to: r2.id },
    });
  });

  it('tornar responsável grava a promoção com os acompanhantes levados', async () => {
    const customers = fakeCustomerRepository();
    const audit = fakeAuditLogRepository();
    const { r, r2 } = await family(customers);
    // acompanhante da família de origem (r2 vazia); usa r com um filho já criado
    const filho = await registerCompanion({ customers }, ctx, {
      responsibleId: r.id,
      fullName: 'Filho 2',
      cpf: '11144477735',
      birthDate: '2018-07-09',
    });

    await promoteToResponsible({ customers, audit }, ctx, {
      customerId: filho.id,
      bringCompanionIds: [],
    });

    const trail = await audit.listByEntity(ctx.tenantId, 'customer', filho.id);
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({
      action: 'family.promote',
      diff: { from: r.id, to: null, brought: [] },
    });
    expect(r2).toBeDefined();
  });
});

describe('§3.2.1 · CL-07: merge de duplicados é auditado', () => {
  it('grava a fusão no sobrevivente apontando o duplicado', async () => {
    const customers = fakeCustomerRepository();
    const vehicles = fakeVehicleRepository();
    const audit = fakeAuditLogRepository();
    const survivor = await registerCustomer({ customers }, ctx, {
      fullName: 'Sobrevivente',
      cpf: '90000010057',
      birthDate: '1980-01-01',
      ...contact,
    });
    const duplicate = await registerCustomer({ customers }, ctx, {
      fullName: 'Duplicado',
      cpf: '12345678909',
      birthDate: '1980-01-01',
      ...contact,
    });

    await mergeCustomers({ customers, vehicles, audit }, ctx, {
      survivorId: survivor.id,
      duplicateId: duplicate.id,
    });

    const trail = await audit.listByEntity(ctx.tenantId, 'customer', survivor.id);
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({
      action: 'customer.merge',
      entityId: survivor.id,
      diff: { merged: duplicate.id },
    });
  });
});

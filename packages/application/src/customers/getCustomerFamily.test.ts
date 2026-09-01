import { describe, expect, it } from 'vitest';
import { parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeCustomerRepository } from './customerRepository.fake.js';
import { getCustomerFamily } from './getCustomerFamily.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { EMPTY_ADDRESS } from './customerRepository.js';
import type { RequestContext } from '../context.js';

/**
 * CL-06 — a família com os dados completos, para a equipe editar a ficha no back-office.
 * É leitura de equipe: o portal tem a sua (`listPortalFamily`, com CPF mascarado), e o
 * cliente não passa por aqui.
 */
const team: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'operator' },
};

async function seed() {
  const customers = fakeCustomerRepository();
  const head = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: null,
    fullName: 'Ana Prado',
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate('1988-03-04'),
    email: 'ana@example.com',
    phone: '5548999990000',
    address: EMPTY_ADDRESS,
  });
  const companion = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: head.id,
    fullName: 'Bruno Prado',
    cpf: parseCpf('277.373.070-44'),
    birthDate: parseLocalDate('2015-07-10'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });
  return { customers, head, companion };
}

describe('CL-06: a família completa para a equipe editar', () => {
  it('pelo responsável, devolve ele e os acompanhantes', async () => {
    const { customers, head, companion } = await seed();
    const family = await getCustomerFamily({ customers }, team, { customerId: head.id });
    expect(family.responsible.id).toBe(head.id);
    expect(family.companions.map((c) => c.id)).toEqual([companion.id]);
    expect(family.companions[0]!.birthDate).toEqual(parseLocalDate('2015-07-10'));
  });

  it('pelo acompanhante, devolve a mesma família (resolve pelo head)', async () => {
    const { customers, head, companion } = await seed();
    const family = await getCustomerFamily({ customers }, team, { customerId: companion.id });
    expect(family.responsible.id).toBe(head.id);
    expect(family.companions.map((c) => c.id)).toEqual([companion.id]);
  });

  it('o cliente não lê por aqui — o portal tem a própria leitura', async () => {
    const { customers, head } = await seed();
    const customerCtx: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', customerId: head.id, userId: 'cust-1' },
    };
    await expect(
      getCustomerFamily({ customers }, customerCtx, { customerId: head.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente inexistente é recusado', async () => {
    const { customers } = await seed();
    await expect(
      getCustomerFamily({ customers }, team, { customerId: 'nao-existe' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

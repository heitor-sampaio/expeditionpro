import { describe, expect, it } from 'vitest';
import { formatCpf, parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeCustomerRepository } from './customerRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { updateCustomer } from './updateCustomer.js';
import { DuplicateCpfError } from './errors.js';
import { ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import { EMPTY_ADDRESS } from './customerRepository.js';
import type { RequestContext } from '../context.js';

/**
 * CL-06 — a equipe edita a ficha inteira do cliente (responsável ou acompanhante),
 * inclusive identidade. É o caminho autoritário: o cliente, pelo portal, só pede
 * (PC-07). Identidade define preço e nota, então mexer nela exige owner/admin, o
 * mesmo peso da decisão da fila.
 */

const admin: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
const operator: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u2', role: 'operator' },
};

async function seed() {
  const customers = fakeCustomerRepository();
  const audit = fakeAuditLogRepository();
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
  return { customers, audit, head, companion };
}

describe('CL-06: a equipe edita os dados do cliente', () => {
  it('grava identidade e contato normalizados (nome, telefone E.164, CEP só dígitos)', async () => {
    const { customers, audit, head } = await seed();

    const updated = await updateCustomer({ customers, audit }, admin, {
      customerId: head.id,
      fullName: '  ana maria da silva  ',
      birthDate: '1988-03-05',
      phone: '(48) 99999-8877',
      address: { zip: '88015-200', city: 'Florianópolis', state: 'sc' },
    });

    expect(updated.fullName).toBe('Ana Maria da Silva');
    expect(updated.phone).toBe('5548999998877');
    expect(updated.birthDate).toEqual(parseLocalDate('1988-03-05'));
    expect(updated.address.zip).toBe('88015200');
    expect(updated.address.state).toBe('SC');
    expect(updated.email).toBe('ana@example.com'); // ausente preserva
  });

  it('troca o CPF quando é válido e livre no tenant', async () => {
    const { customers, audit, head } = await seed();
    const updated = await updateCustomer({ customers, audit }, admin, {
      customerId: head.id,
      cpf: '900.000.100-57',
    });
    expect(formatCpf(updated.cpf)).toBe('900.000.100-57');
  });

  it('recusa CPF que já é de outro cliente, mas aceita o próprio de volta', async () => {
    const { customers, audit, head, companion } = await seed();

    await expect(
      updateCustomer({ customers, audit }, admin, {
        customerId: head.id,
        cpf: '277.373.070-44', // o do acompanhante
      }),
    ).rejects.toBeInstanceOf(DuplicateCpfError);

    const same = await updateCustomer({ customers, audit }, admin, {
      customerId: companion.id,
      cpf: '277.373.070-44',
    });
    expect(same.id).toBe(companion.id);
  });

  it('§3.2: responsável não fica sem e-mail nem sem telefone; acompanhante pode', async () => {
    const { customers, audit, head, companion } = await seed();

    await expect(
      updateCustomer({ customers, audit }, admin, { customerId: head.id, email: '  ' }),
    ).rejects.toBeInstanceOf(RequiredFieldError);
    await expect(
      updateCustomer({ customers, audit }, admin, { customerId: head.id, phone: '' }),
    ).rejects.toBeInstanceOf(RequiredFieldError);

    const cleared = await updateCustomer({ customers, audit }, admin, {
      customerId: companion.id,
      email: '',
      phone: '',
    });
    expect(cleared.email).toBeNull();
    expect(cleared.phone).toBeNull();
  });

  it('PC-07: o cliente não edita por aqui — o portal pede, a equipe decide', async () => {
    const { customers, audit, head } = await seed();
    const customerCtx: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', customerId: head.id, userId: 'cust-1' },
    };
    await expect(
      updateCustomer({ customers, audit }, customerCtx, {
        customerId: head.id,
        fullName: 'Outro Nome',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('identidade exige owner/admin; operador ainda edita contato', async () => {
    const { customers, audit, head } = await seed();

    await expect(
      updateCustomer({ customers, audit }, operator, {
        customerId: head.id,
        fullName: 'Ana Prado Souza',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const contact = await updateCustomer({ customers, audit }, operator, {
      customerId: head.id,
      email: 'nova@example.com',
    });
    expect(contact.email).toBe('nova@example.com');
  });

  it('cliente de outro tenant (ou inexistente) é recusado', async () => {
    const { customers, audit } = await seed();
    await expect(
      updateCustomer({ customers, audit }, admin, { customerId: 'nao-existe', email: 'x@y.z' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('§3.2.1: registra na auditoria quais campos mudaram — nunca o valor pessoal', async () => {
    const { customers, audit, head } = await seed();
    await updateCustomer({ customers, audit }, admin, {
      customerId: head.id,
      fullName: 'Ana Prado Souza',
      phone: '(48) 99999-8877',
      email: 'ana@example.com', // igual ao atual: não conta como mudança
    });

    expect(audit.rows).toHaveLength(1);
    const entry = audit.rows[0]!;
    expect(entry.action).toBe('customer.update');
    expect(entry.entityId).toBe(head.id);
    expect(entry.diff).toEqual({ fields: ['fullName', 'phone'] });
    expect(JSON.stringify(entry.diff)).not.toContain('Ana Prado Souza');
  });

  it('sem mudança nenhuma não escreve auditoria', async () => {
    const { customers, audit, head } = await seed();
    await updateCustomer({ customers, audit }, admin, {
      customerId: head.id,
      fullName: 'Ana Prado',
    });
    expect(audit.rows).toHaveLength(0);
  });
});

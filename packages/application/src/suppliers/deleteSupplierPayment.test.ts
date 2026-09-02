import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { fakeSupplierRepository } from './supplierRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { deleteSupplierPayment } from './deleteSupplierPayment.js';
import { cents, parseLocalDate } from '@expedition/domain';
import type { RequestContext } from '../context.js';

/**
 * GR-19 — excluir um pagamento a fornecedor lançado errado.
 *
 * Existia a assimetria: dava para excluir recebimento do cliente (IN-11) e o gasto do
 * fornecedor (GR-18), mas não o **pagamento** ao fornecedor. Quem digitava 1.200,00 no
 * lugar de 120,00 ficava com a margem do grupo errada e sem saída pela tela.
 */

const owner: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};
const operator: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u2', role: 'operator' },
};
const cliente: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u3', customerId: 'c1' },
};

async function comPagamento() {
  const suppliers = fakeSupplierRepository();
  const audit = fakeAuditLogRepository();
  const fornecedor = await suppliers.createSupplier({
    tenantId: 'tenant-a',
    name: 'Fazenda',
    doc: null,
    docType: null,
    pixKey: null,
    pixKeyType: null,
    phone: null,
    email: null,
    notes: null,
    categoryId: null,
  });
  const gasto = await suppliers.addExpense({
    tenantId: 'tenant-a',
    groupId: 'grp-1',
    supplierId: fornecedor.id,
    description: 'pernoite',
    totalCents: cents(120000),
  });
  const pagamento = await suppliers.addPayment({
    tenantId: 'tenant-a',
    supplierExpenseId: gasto.id,
    paidAt: parseLocalDate('2026-05-10'),
    amountCents: cents(60000),
    method: 'pix',
    reference: null,
    notes: null,
    createdBy: 'u1',
  });
  return { suppliers, audit, gasto, pagamento };
}

describe('GR-19: excluir pagamento a fornecedor', () => {
  it('some das leituras e o pago do gasto volta a zero', async () => {
    const { suppliers, audit, gasto, pagamento } = await comPagamento();

    await deleteSupplierPayment({ suppliers, audit }, owner, { paymentId: pagamento.id });

    const restantes = await suppliers.listPaymentsByGroup('tenant-a', 'grp-1');
    expect(restantes).toHaveLength(0);
    expect(await suppliers.countPaymentsByExpense('tenant-a', gasto.id)).toBe(0);
  });

  it('operator não exclui — é ato financeiro, como o recebimento (IN-09)', async () => {
    const { suppliers, audit, pagamento } = await comPagamento();
    await expect(
      deleteSupplierPayment({ suppliers, audit }, operator, { paymentId: pagamento.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não chega perto', async () => {
    const { suppliers, audit, pagamento } = await comPagamento();
    await expect(
      deleteSupplierPayment({ suppliers, audit }, cliente, { paymentId: pagamento.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('pagamento inexistente responde 404', async () => {
    const { suppliers, audit } = await comPagamento();
    await expect(
      deleteSupplierPayment({ suppliers, audit }, owner, { paymentId: 'nao-existe' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deixa trilha com quanto era e de qual gasto — dinheiro que some sem valor é pior', async () => {
    const { suppliers, audit, gasto, pagamento } = await comPagamento();

    await deleteSupplierPayment({ suppliers, audit }, owner, { paymentId: pagamento.id });

    const trilha = audit.rows.find((e) => e.action === 'supplier_payment.delete');
    expect(trilha).toBeDefined();
    expect(trilha?.diff).toMatchObject({
      amountCents: 60000,
      supplierExpenseId: gasto.id,
    });
  });
});

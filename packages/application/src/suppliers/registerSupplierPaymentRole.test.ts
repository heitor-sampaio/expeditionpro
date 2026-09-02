import { describe, expect, it } from 'vitest';
import { cents } from '@expedition/domain';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeSupplierRepository } from './supplierRepository.fake.js';
import { registerSupplierPayment } from './registerSupplierPayment.js';
import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';

function ctxCom(role: 'owner' | 'admin' | 'operator'): RequestContext {
  return { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u1', role } };
}

/**
 * A09 · M5 — pagar fornecedor exige o mesmo que receber de cliente.
 *
 * A assimetria era ao contrário do risco: `registerPayment` (dinheiro **entrando**) já
 * exigia owner ou admin, e `deleteSupplierPayment` também — mas registrar que o dinheiro
 * **saiu** bastava ser equipe. A direção onde a fraude mora era a menos protegida, e um
 * pagamento inventado a um fornecedor com chave PIX recém-trocada fecha o círculo inteiro
 * sem passar por ninguém.
 *
 * Lançar o gasto (`addSupplierExpense`) continua com o operador de propósito: é o
 * compromisso, não o caixa, e quem está na estrada precisa registrar a pousada no ato.
 */
describe('M5: registrar pagamento a fornecedor exige owner ou admin', () => {
  async function comGasto() {
    const suppliers = fakeSupplierRepository();
    const audit = fakeAuditLogRepository();
    const forn = await suppliers.createSupplier({
      tenantId: 'tenant-a',
      name: 'Pousada',
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
      supplierId: forn.id,
      groupId: 'grupo-1',
      description: 'Hospedagem',
      totalCents: cents(100000),
    });
    return { suppliers, audit, gasto };
  }

  const pagamento = { amountCents: 50000, method: 'pix', paidAt: '2026-05-10' };

  it('operator não registra pagamento a fornecedor', async () => {
    const { suppliers, audit, gasto } = await comGasto();

    await expect(
      registerSupplierPayment({ suppliers, audit }, ctxCom('operator'), {
        expenseId: gasto.id,
        ...pagamento,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it.each(['owner', 'admin'] as const)('%s registra normalmente', async (role) => {
    const { suppliers, audit, gasto } = await comGasto();

    const pago = await registerSupplierPayment({ suppliers, audit }, ctxCom(role), {
      expenseId: gasto.id,
      ...pagamento,
    });

    expect(pago.amountCents).toBe(50000);
  });

  it('a mensagem diz o que falta, não só que faltou', async () => {
    const { suppliers, audit, gasto } = await comGasto();
    try {
      await registerSupplierPayment({ suppliers, audit }, ctxCom('operator'), {
        expenseId: gasto.id,
        ...pagamento,
      });
      expect.unreachable('deveria ter recusado');
    } catch (erro) {
      expect((erro as Error).message).toContain('owner ou admin');
    }
  });
});

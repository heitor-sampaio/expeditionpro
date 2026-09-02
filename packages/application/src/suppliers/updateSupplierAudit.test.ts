import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeSupplierRepository } from './supplierRepository.fake.js';
import { createSupplier } from './createSupplier.js';
import { updateSupplier } from './updateSupplier.js';
import type { RequestContext } from '../context.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

/**
 * A09 · FO-07 — editar fornecedor deixa rastro, e a chave PIX é o motivo.
 *
 * Trocar a chave PIX redireciona o dinheiro: quem paga a pousada passa a pagar outra
 * conta, e nada na tela denuncia isso — o nome do fornecedor continua o mesmo. É a
 * alteração de cadastro com maior potencial de fraude no sistema, e até aqui a única
 * sem registro de quem fez.
 *
 * A trilha guarda a chave **mascarada**: a investigação precisa reconhecer a troca,
 * não reconstituir a chave. Guardar crua violaria a regra da própria trilha, porque a
 * chave costuma ser um CPF ou um telefone.
 */
describe('A09: trilha na edição de fornecedor', () => {
  async function comFornecedor() {
    const suppliers = fakeSupplierRepository();
    const audit = fakeAuditLogRepository();
    const forn = await createSupplier({ suppliers }, ctx, {
      name: 'Pousada da Serra',
      pixKey: '900.000.100-57',
    });
    return { suppliers, audit, forn };
  }

  it('troca de chave PIX grava quem fez, e as duas chaves mascaradas', async () => {
    const { suppliers, audit, forn } = await comFornecedor();

    await updateSupplier({ suppliers, audit }, ctx, {
      id: forn.id,
      pixKey: 'financeiro@outrolugar.com',
    });

    const linhas = await audit.listByEntity('tenant-a', 'supplier', forn.id);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      actorUserId: 'u1',
      action: 'supplier.update',
      diff: {
        pixKey: { from: '900.***.***-57', to: 'f***@outrolugar.com' },
        pixKeyType: { from: 'cpf', to: 'email' },
      },
    });
  });

  it('a chave crua não entra na trilha — ela costuma ser um CPF', async () => {
    const { suppliers, audit, forn } = await comFornecedor();

    await updateSupplier({ suppliers, audit }, ctx, {
      id: forn.id,
      pixKey: 'financeiro@outrolugar.com',
    });

    const linhas = await audit.listByEntity('tenant-a', 'supplier', forn.id);
    const serializado = JSON.stringify(linhas[0]!.diff);
    expect(serializado).not.toContain('90000010057');
    expect(serializado).not.toContain('financeiro@outrolugar.com');
  });

  it('limpar a chave também é troca — o pagamento deixa de ter destino', async () => {
    const { suppliers, audit, forn } = await comFornecedor();

    await updateSupplier({ suppliers, audit }, ctx, { id: forn.id, pixKey: null });

    const linhas = await audit.listByEntity('tenant-a', 'supplier', forn.id);
    expect(linhas[0]!.diff).toMatchObject({
      pixKey: { from: '900.***.***-57', to: null },
    });
  });

  it('outros campos entram no mesmo diff, com valor legível', async () => {
    const { suppliers, audit, forn } = await comFornecedor();

    await updateSupplier({ suppliers, audit }, ctx, { id: forn.id, name: 'Pousada do Vale' });

    const linhas = await audit.listByEntity('tenant-a', 'supplier', forn.id);
    expect(linhas[0]!.diff).toEqual({
      name: { from: 'Pousada da Serra', to: 'Pousada do Vale' },
    });
  });

  it('edição que não muda nada não gera linha — trilha cheia de ruído não é lida', async () => {
    const { suppliers, audit, forn } = await comFornecedor();

    await updateSupplier({ suppliers, audit }, ctx, { id: forn.id, name: 'Pousada da Serra' });

    expect(await audit.listByEntity('tenant-a', 'supplier', forn.id)).toHaveLength(0);
  });
});

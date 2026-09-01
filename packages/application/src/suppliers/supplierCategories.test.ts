import { describe, expect, it } from 'vitest';
import { fakeSupplierRepository } from './supplierRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { createSupplier } from './createSupplier.js';
import { updateSupplier } from './updateSupplier.js';
import { createSupplierCategory } from './createSupplierCategory.js';
import { listSupplierCategories } from './listSupplierCategories.js';
import { renameSupplierCategory } from './renameSupplierCategory.js';
import { deleteSupplierCategory } from './deleteSupplierCategory.js';
import { BusinessRuleError, ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';

/**
 * FO-05 — a gerência do catálogo de categorias. Criar já existia (FO-04); o que faltava é
 * poder consertar um nome errado e tirar do caminho uma categoria que não se usa mais.
 *
 * Como a categoria é do **fornecedor** e o gasto a herda na leitura, renomear reescreve o
 * passado do relatório de propósito — e excluir reescreveria também, mas em silêncio. É
 * essa diferença que a trava de exclusão guarda.
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
const operator: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u2', role: 'operator' },
};

function setup() {
  const suppliers = fakeSupplierRepository();
  const audit = fakeAuditLogRepository();
  return { suppliers, audit, deps: { suppliers, audit } };
}

describe('FO-05: renomear categoria', () => {
  /**
   * O nome que o fornecedor mostra é resolvido na **leitura**, não gravado nele. Se fosse
   * gravado, renomear deixaria de alcançar quem já apontava para a categoria — e o
   * relatório mostraria dois nomes para a mesma coisa.
   */
  it('o fornecedor passa a mostrar o nome novo', async () => {
    const s = setup();
    const cat = await createSupplierCategory(s.deps, ctx, { name: 'Hospedagem' });
    await createSupplier({ suppliers: s.suppliers }, ctx, {
      name: 'Fazenda do Barreiro',
      categoryId: cat.id,
    });

    await renameSupplierCategory(s.deps, ctx, { id: cat.id, name: 'Hospedagem e camping' });

    const [forn] = await s.suppliers.listSuppliers('tenant-a');
    expect(forn?.categoryName).toBe('Hospedagem e camping');
  });

  it('apara espaço nas bordas', async () => {
    const s = setup();
    const cat = await createSupplierCategory(s.deps, ctx, { name: 'Comida' });

    const renamed = await renameSupplierCategory(s.deps, ctx, {
      id: cat.id,
      name: '  Refeições  ',
    });

    expect(renamed.name).toBe('Refeições');
  });

  it('nome em branco é recusado', async () => {
    const s = setup();
    const cat = await createSupplierCategory(s.deps, ctx, { name: 'Comida' });

    await expect(
      renameSupplierCategory(s.deps, ctx, { id: cat.id, name: '   ' }),
    ).rejects.toBeInstanceOf(RequiredFieldError);
  });

  /** O unique é `(tenant_id, name)`: sem esta checagem, o erro viria cru do banco. */
  it('nome já usado por outra categoria é recusado', async () => {
    const s = setup();
    await createSupplierCategory(s.deps, ctx, { name: 'Hospedagem' });
    const outra = await createSupplierCategory(s.deps, ctx, { name: 'Comida' });

    await expect(
      renameSupplierCategory(s.deps, ctx, { id: outra.id, name: 'Hospedagem' }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('renomear para o mesmo nome passa, e não acusa duplicado de si mesma', async () => {
    const s = setup();
    const cat = await createSupplierCategory(s.deps, ctx, { name: 'Hospedagem' });

    await expect(
      renameSupplierCategory(s.deps, ctx, { id: cat.id, name: 'Hospedagem' }),
    ).resolves.toMatchObject({ name: 'Hospedagem' });
  });

  it('categoria de outro tenant não é encontrada', async () => {
    const s = setup();
    const outroTenant: RequestContext = {
      tenantId: 'tenant-b',
      actor: { kind: 'team', userId: 'u3', role: 'admin' },
    };
    const cat = await createSupplierCategory(s.deps, outroTenant, { name: 'Alheia' });

    await expect(
      renameSupplierCategory(s.deps, ctx, { id: cat.id, name: 'Minha' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('operator não renomeia — renomear reescreve o passado do relatório', async () => {
    const s = setup();
    const cat = await createSupplierCategory(s.deps, ctx, { name: 'Hospedagem' });

    await expect(
      renameSupplierCategory(s.deps, operator, { id: cat.id, name: 'Outro' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a trilha registra de que nome para qual', async () => {
    const s = setup();
    const cat = await createSupplierCategory(s.deps, ctx, { name: 'Hospedagem' });

    await renameSupplierCategory(s.deps, ctx, { id: cat.id, name: 'Pousada' });

    const entry = s.audit.rows.find((row) => row.action === 'supplier_category.rename');
    expect(entry).toMatchObject({ entity: 'supplier_category', entityId: cat.id });
    expect(entry?.diff).toEqual({ from: 'Hospedagem', to: 'Pousada' });
  });
});

describe('FO-05: excluir categoria', () => {
  it('categoria sem fornecedor sai da lista', async () => {
    const s = setup();
    const cat = await createSupplierCategory(s.deps, ctx, { name: 'Sem uso' });

    await deleteSupplierCategory(s.deps, ctx, { id: cat.id });

    await expect(listSupplierCategories({ suppliers: s.suppliers }, ctx)).resolves.toEqual([]);
  });

  /**
   * A FK é `ON DELETE SET NULL`: sem esta trava, excluir desvincularia os fornecedores em
   * silêncio, e como o gasto herda a categoria deles, o histórico inteiro do relatório
   * mudaria sem ninguém ter decidido isso. Recategorizar é o caminho, e é reversível.
   */
  it('categoria em uso é recusada, dizendo quantos fornecedores usam', async () => {
    const s = setup();
    const cat = await createSupplierCategory(s.deps, ctx, { name: 'Hospedagem' });
    await createSupplier({ suppliers: s.suppliers }, ctx, {
      name: 'Pousada A',
      categoryId: cat.id,
    });
    await createSupplier({ suppliers: s.suppliers }, ctx, {
      name: 'Pousada B',
      categoryId: cat.id,
    });

    const erro = await deleteSupplierCategory(s.deps, ctx, { id: cat.id }).catch(
      (e: unknown) => e as BusinessRuleError,
    );

    expect(erro).toBeInstanceOf(BusinessRuleError);
    expect((erro as BusinessRuleError).code).toBe('category_in_use');
    expect((erro as BusinessRuleError).message).toContain('2');
  });

  it('depois de recategorizar o último fornecedor, a exclusão passa', async () => {
    const s = setup();
    const cat = await createSupplierCategory(s.deps, ctx, { name: 'Hospedagem' });
    const forn = await createSupplier({ suppliers: s.suppliers }, ctx, {
      name: 'Pousada',
      categoryId: cat.id,
    });
    await updateSupplier({ suppliers: s.suppliers }, ctx, { id: forn.id, categoryId: null });

    await expect(deleteSupplierCategory(s.deps, ctx, { id: cat.id })).resolves.toBeUndefined();
  });

  it('categoria inexistente', async () => {
    const s = setup();

    await expect(deleteSupplierCategory(s.deps, ctx, { id: 'nao-existe' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('operator não exclui', async () => {
    const s = setup();
    const cat = await createSupplierCategory(s.deps, ctx, { name: 'Hospedagem' });

    await expect(deleteSupplierCategory(s.deps, operator, { id: cat.id })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('a trilha registra o nome que deixou de existir', async () => {
    const s = setup();
    const cat = await createSupplierCategory(s.deps, ctx, { name: 'Hospedagem' });

    await deleteSupplierCategory(s.deps, ctx, { id: cat.id });

    const entry = s.audit.rows.find((row) => row.action === 'supplier_category.delete');
    expect(entry).toMatchObject({ entity: 'supplier_category', entityId: cat.id });
    expect(entry?.diff).toEqual({ name: 'Hospedagem' });
  });
});

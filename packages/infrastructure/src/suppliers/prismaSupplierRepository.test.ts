import { describe, expect, it } from 'vitest';
import type { NewSupplier, SupplierPatch } from '@expedition/application';
import { supplierCreateData, supplierUpdateData } from './prismaSupplierRepository.js';

/**
 * O `data` do Prisma é uma lista branca escrita à mão — é a escolha certa (nunca espalhar
 * o objeto de entrada dentro de um `create`), mas ela silencia: campo esquecido não dá erro
 * de compilação nem de execução, o registro salva sem ele e a tela diz que deu certo.
 *
 * Foi exatamente o que aconteceu com a chave PIX (FO-07): o mapper de leitura devolvia
 * `pixKey`, os testes de rota passavam em repositório de memória, e o banco recebia NULL.
 * Por isso a montagem do payload é uma função pura, testada sem Postgres.
 */

const novo: NewSupplier = {
  tenantId: 'tenant-a',
  name: 'Fazenda do Barreiro',
  doc: '19131243000197',
  docType: 'cnpj',
  pixKey: 'contato@fazenda.com.br',
  pixKeyType: 'email',
  phone: '5548999998888',
  email: 'contato@fazenda.com.br',
  notes: null,
  categoryId: 'cat-1',
};

describe('FO-07: a chave PIX chega ao banco', () => {
  it('leva chave e tipo no create', () => {
    expect(supplierCreateData(novo)).toMatchObject({
      pixKey: 'contato@fazenda.com.br',
      pixKeyType: 'email',
    });
  });

  it('leva chave e tipo no update', () => {
    const patch: SupplierPatch = {
      name: novo.name,
      doc: novo.doc,
      docType: novo.docType,
      pixKey: '19131243000197',
      pixKeyType: 'cnpj',
      phone: null,
      email: null,
      notes: null,
      categoryId: null,
    };
    expect(supplierUpdateData(patch)).toMatchObject({
      pixKey: '19131243000197',
      pixKeyType: 'cnpj',
    });
  });

  it('limpa chave e tipo juntos quando o patch traz null', () => {
    const patch: SupplierPatch = {
      name: novo.name,
      doc: null,
      docType: null,
      pixKey: null,
      pixKeyType: null,
      phone: null,
      email: null,
      notes: null,
      categoryId: null,
    };
    expect(supplierUpdateData(patch)).toMatchObject({ pixKey: null, pixKeyType: null });
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryCustomers } from '../dev/inMemoryCustomers.js';
import { inMemoryVehicles } from '../dev/inMemoryVehicles.js';
import { inMemoryItineraries } from '../dev/inMemoryItineraries.js';
import { inMemorySchedule } from '../dev/inMemorySchedule.js';
import { inMemoryBookings } from '../dev/inMemoryBookings.js';
import { inMemoryPayments } from '../dev/inMemoryPayments.js';
import { inMemorySuppliers } from '../dev/inMemorySuppliers.js';
import { inMemoryApiKeys, inMemoryIntake } from '../dev/inMemoryIntake.js';
import { inMemoryFormMappings } from '../dev/inMemoryFormMappings.js';
import { inMemoryTenants } from '../dev/inMemoryTenants.js';
import { inMemoryCashback } from '../dev/inMemoryCashback.js';
import { inMemoryCoupons } from '../dev/inMemoryCoupons.js';
import { inMemoryIdentityChange } from '../dev/inMemoryIdentityChange.js';
import { inMemoryAudit } from '../dev/inMemoryAudit.js';
import { inMemoryLegalDocuments } from '../dev/inMemoryLegalDocuments.js';
import { inMemoryConsents } from '../dev/inMemoryConsents.js';
import { inMemoryCommunity } from '../dev/inMemoryCommunity.js';
import { inMemoryMediaConsents } from '../dev/inMemoryMediaConsents.js';
import {
  inMemoryPaymentIntegrations,
  inMemoryPaymentCharges,
} from '../dev/inMemoryPaymentGateway.js';
import { asaasGateway } from '@expedition/infrastructure';
import type { RequestContext } from '@expedition/application';
import type { FastifyInstance } from 'fastify';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const clienteCtx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u2', customerId: 'c1' },
};

/* Quem a rota diz ser — mutável, para trocar de audiência no mesmo servidor. */
let atual: RequestContext = ctx;

const PRICE = {
  validFrom: '2025-01-01',
  coupleCents: 200000,
  soloCents: 120000,
  extraAdultCents: 80000,
  childMidCents: 60000,
  childYoungCents: 40000,
};

describe('FO-01/GR-08/09/10: rotas de fornecedor e margem', () => {
  let app: FastifyInstance;
  let groupId: string;

  beforeAll(async () => {
    const bookings = inMemoryBookings();
    app = await buildServer({
      logger: false,
      deps: {
        customers: inMemoryCustomers(),
        vehicles: inMemoryVehicles(),
        itineraries: inMemoryItineraries(),
        schedule: inMemorySchedule(),
        bookings,
        payments: inMemoryPayments(bookings.rows),
        suppliers: inMemorySuppliers(),
        apiKeys: inMemoryApiKeys([]),
        intake: inMemoryIntake(),
        formMappings: inMemoryFormMappings(),
        tenants: inMemoryTenants(),
        cashback: inMemoryCashback(),
        coupons: inMemoryCoupons(),
        identityRequests: inMemoryIdentityChange(),
        audit: inMemoryAudit(),
        documents: inMemoryLegalDocuments(),
        consents: inMemoryConsents(),
        community: inMemoryCommunity(),
        media: inMemoryMediaConsents(),
        paymentIntegrations: inMemoryPaymentIntegrations(),
        charges: inMemoryPaymentCharges(),
        paymentGateway: asaasGateway(),
        resolveContext: () => Promise.resolve(atual),
      },
    });
    await app.ready();
    const itin = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Fornec Rica', prices: PRICE },
      })
    ).json();
    const ev = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId: itin.id, startDate: '2025-11-10', endDate: '2025-11-14' },
      })
    ).json();
    groupId = ev.group.id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('cadastra fornecedor, lança gasto, paga e lê a margem (receita − gastos)', async () => {
    // uma inscrição confirmada de 300000 como receita
    const resp = (
      await app.inject({
        method: 'POST',
        url: '/v1/customers',
        payload: {
          fullName: 'R',
          cpf: '90000010057',
          birthDate: '1989-01-14',
          email: 'r@ex.com',
          phone: '48999998877',
        },
      })
    ).json();
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${groupId}/bookings`,
        payload: { responsibleCustomerId: resp.id, participantCustomerIds: [resp.id] },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/payments`,
      payload: { amountCents: 120000, method: 'pix', paidAt: '2025-11-01' },
    }); // confirma → receita 120000 (SOLO)

    const sup = (
      await app.inject({
        method: 'POST',
        url: '/v1/suppliers',
        payload: { name: 'Pousada', doc: '11.222.333/0001-81', docType: 'cnpj' },
      })
    ).json();
    expect(sup.doc).toBe('11.222.333/0001-81'); // CNPJ pontuado, como o cliente já fazia

    const exp = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${groupId}/expenses`,
        payload: { supplierId: sup.id, description: 'hospedagem', totalCents: 80000 },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/v1/expenses/${exp.id}/payments`,
      payload: { amountCents: 50000, method: 'pix', paidAt: '2025-11-02' },
    });

    const res = await app.inject({ method: 'GET', url: `/v1/groups/${groupId}/result` });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r.revenueContractedCents).toBe(120000);
    expect(r.receivedCents).toBe(120000);
    expect(r.expenseTotalCents).toBe(80000);
    expect(r.paidToSuppliersCents).toBe(50000);
    expect(r.grossMarginCents).toBe(40000); // 120000 - 80000
    expect(r.marginPercent).toBeCloseTo(33.3, 1);
    expect(r.supplierOutstandingCents).toBe(30000); // 80000 - 50000
  });

  it('FO-03: ficha do fornecedor agrega saídas/pagamentos/totais e mostra o CPF inteiro', async () => {
    const sup = (
      await app.inject({
        method: 'POST',
        url: '/v1/suppliers',
        payload: { name: 'Guia João', doc: '111.444.777-35', docType: 'cpf' },
      })
    ).json();
    const exp = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${groupId}/expenses`,
        payload: { supplierId: sup.id, description: 'condução', totalCents: 200000 },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/v1/expenses/${exp.id}/payments`,
      payload: { amountCents: 60000, method: 'pix', paidAt: '2025-11-03' },
    });

    const res = await app.inject({ method: 'GET', url: `/v1/suppliers/${sup.id}/file` });
    expect(res.statusCode).toBe(200);
    const file = res.json();
    /*
     * Back-office mostra o documento **inteiro e pontuado**, como já era com o cliente
     * (decisão do dono). A área de fornecedor é só da equipe (SEC-01), que é a audiência
     * autorizada; documento mascarado ali é dado inútil para quem precisa conferir a nota.
     */
    expect(file.supplier.doc).toBe('111.444.777-35');
    expect(file.saidas).toHaveLength(1);
    expect(file.saidas[0].contractedCents).toBe(200000);
    expect(file.saidas[0].paidCents).toBe(60000);
    expect(file.saidas[0].outstandingCents).toBe(140000);
    expect(file.saidas[0].startDate).toBe('2025-11-10');
    expect(file.pagamentos).toHaveLength(1);
    expect(file.pagamentos[0].groupName).toBeDefined();
    expect(file.totals.outstandingCents).toBe(140000);
  });

  it('FO-03: ficha de fornecedor inexistente responde 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/suppliers/nao-existe/file' });
    expect(res.statusCode).toBe(404);
  });

  it('documento duplicado responde 400', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/suppliers',
      payload: { name: 'A', doc: '99888777000100', docType: 'cnpj' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/suppliers',
      payload: { name: 'B', doc: '99.888.777/0001-00', docType: 'cnpj' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('duplicate_supplier');
  });

  it('FO-07: cadastra com chave PIX e recebe ela formatada, com o tipo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/suppliers',
      payload: { name: 'Pousada PIX', pixKey: '900.000.100-57' },
    });

    expect(res.statusCode).toBe(201);
    // Sai formatada e inteira: a chave existe para ser copiada num app de banco.
    expect(res.json().pixKey).toBe('900.000.100-57');
    expect(res.json().pixKeyType).toBe('cpf');
  });

  it('FO-07: chave inválida para na borda', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/suppliers',
      payload: { name: 'Pousada ruim', pixKey: 'a chave da pousada' },
    });

    expect(res.statusCode).toBe(422);
  });

  it('FO-07: PATCH troca a chave e o tipo acompanha', async () => {
    const sup = (
      await app.inject({
        method: 'POST',
        url: '/v1/suppliers',
        payload: { name: 'Pousada troca', pixKey: 'contato@pousada.com.br' },
      })
    ).json();

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/suppliers/${sup.id}`,
      payload: { pixKey: '(48) 99999-8877' },
    });

    expect(res.json().pixKeyType).toBe('phone');
    expect(res.json().pixKey).toBe('+55 (48)99999-8877');
  });

  it('GR-18: exclui o gasto e ele some da tabela do grupo', async () => {
    const sup = (
      await app.inject({ method: 'POST', url: '/v1/suppliers', payload: { name: 'Pousada GR18' } })
    ).json();
    const gasto = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${groupId}/expenses`,
        payload: { supplierId: sup.id, description: 'Pernoite', totalCents: 120000 },
      })
    ).json();

    const res = await app.inject({ method: 'DELETE', url: `/v1/expenses/${gasto.id}` });
    expect(res.statusCode).toBe(204);

    const lista = await app.inject({ method: 'GET', url: `/v1/groups/${groupId}/expenses` });
    expect(lista.json().some((e: { id: string }) => e.id === gasto.id)).toBe(false);
  });

  it('GR-18: gasto com pagamento responde 400 e continua na tabela', async () => {
    const sup = (
      await app.inject({ method: 'POST', url: '/v1/suppliers', payload: { name: 'Pousada paga' } })
    ).json();
    const gasto = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${groupId}/expenses`,
        payload: { supplierId: sup.id, description: 'Pernoite', totalCents: 120000 },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/v1/expenses/${gasto.id}/payments`,
      payload: { amountCents: 50000, method: 'pix', paidAt: '2026-03-11' },
    });

    const res = await app.inject({ method: 'DELETE', url: `/v1/expenses/${gasto.id}` });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('expense_has_payments');

    const lista = await app.inject({ method: 'GET', url: `/v1/groups/${groupId}/expenses` });
    expect(lista.json().some((e: { id: string }) => e.id === gasto.id)).toBe(true);
  });

  it('GR-19: exclui o pagamento e o gasto volta a poder ser excluído', async () => {
    const sup = (
      await app.inject({ method: 'POST', url: '/v1/suppliers', payload: { name: 'Pousada erro' } })
    ).json();
    const gasto = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${groupId}/expenses`,
        payload: { supplierId: sup.id, description: 'Pernoite', totalCents: 120000 },
      })
    ).json();
    const pagamento = (
      await app.inject({
        method: 'POST',
        url: `/v1/expenses/${gasto.id}/payments`,
        payload: { amountCents: 120000, method: 'pix', paidAt: '2026-03-11' },
      })
    ).json();

    /*
     * O gasto recusa exclusão enquanto houver pagamento (GR-18) e manda excluir os
     * pagamentos antes — instrução que até o GR-19 não tinha como ser seguida. A sequência
     * inteira é o que prova que a mensagem virou caminho.
     */
    expect(
      (await app.inject({ method: 'DELETE', url: `/v1/expenses/${gasto.id}` })).statusCode,
    ).toBe(400);

    const excluir = await app.inject({
      method: 'DELETE',
      url: `/v1/supplier-payments/${pagamento.id}`,
    });
    expect(excluir.statusCode).toBe(204);

    const lista = await app.inject({ method: 'GET', url: `/v1/groups/${groupId}/expenses` });
    const linha = lista.json().find((e: { id: string }) => e.id === gasto.id);
    expect(linha.paidCents).toBe(0);

    expect(
      (await app.inject({ method: 'DELETE', url: `/v1/expenses/${gasto.id}` })).statusCode,
    ).toBe(204);
  });

  it('FO-05: renomeia a categoria e o fornecedor passa a mostrar o nome novo', async () => {
    const cat = (
      await app.inject({
        method: 'POST',
        url: '/v1/supplier-categories',
        payload: { name: 'Transporte' },
      })
    ).json();
    const sup = (
      await app.inject({
        method: 'POST',
        url: '/v1/suppliers',
        payload: { name: 'Van do Zé', categoryId: cat.id },
      })
    ).json();

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/supplier-categories/${cat.id}`,
      payload: { name: 'Transporte e apoio' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Transporte e apoio');

    // A prova de que o nome é resolvido na leitura, não gravado no fornecedor.
    const lista = await app.inject({ method: 'GET', url: '/v1/suppliers' });
    const atual = lista.json().find((s: { id: string }) => s.id === sup.id) as {
      categoryName: string;
    };
    expect(atual.categoryName).toBe('Transporte e apoio');
  });

  it('FO-05: nome de categoria repetido responde 400', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/supplier-categories',
      payload: { name: 'Combustível' },
    });
    const outra = (
      await app.inject({
        method: 'POST',
        url: '/v1/supplier-categories',
        payload: { name: 'Pedágio' },
      })
    ).json();

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/supplier-categories/${outra.id}`,
      payload: { name: 'Combustível' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('category_name_taken');
  });

  it('FO-05: categoria em uso não é excluída; livre responde 204 e some da lista', async () => {
    const emUso = (
      await app.inject({
        method: 'POST',
        url: '/v1/supplier-categories',
        payload: { name: 'Guia local' },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: '/v1/suppliers',
      payload: { name: 'Guia Rita', categoryId: emUso.id },
    });

    const recusa = await app.inject({
      method: 'DELETE',
      url: `/v1/supplier-categories/${emUso.id}`,
    });
    expect(recusa.statusCode).toBe(400);
    expect(recusa.json().error).toBe('category_in_use');

    const livre = (
      await app.inject({
        method: 'POST',
        url: '/v1/supplier-categories',
        payload: { name: 'Sem ninguém' },
      })
    ).json();

    const ok = await app.inject({
      method: 'DELETE',
      url: `/v1/supplier-categories/${livre.id}`,
    });
    expect(ok.statusCode).toBe(204);

    const lista = await app.inject({ method: 'GET', url: '/v1/supplier-categories' });
    expect(lista.json().some((c: { id: string }) => c.id === livre.id)).toBe(false);
  });

  it('FO-04: cria categoria, cadastra fornecedor com ela e edita por PATCH', async () => {
    const cat = (
      await app.inject({
        method: 'POST',
        url: '/v1/supplier-categories',
        payload: { name: 'Hospedagem' },
      })
    ).json();
    expect(cat.name).toBe('Hospedagem');

    const list = await app.inject({ method: 'GET', url: '/v1/supplier-categories' });
    expect(list.json().some((c: { id: string }) => c.id === cat.id)).toBe(true);

    const sup = (
      await app.inject({
        method: 'POST',
        url: '/v1/suppliers',
        payload: { name: 'Pousada X', categoryId: cat.id },
      })
    ).json();
    expect(sup.categoryId).toBe(cat.id);
    expect(sup.categoryName).toBe('Hospedagem');

    const patched = await app.inject({
      method: 'PATCH',
      url: `/v1/suppliers/${sup.id}`,
      payload: { name: 'Pousada Y', phone: '5199', categoryId: null },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().name).toBe('Pousada Y');
    expect(patched.json().phone).toBe('5199');
    expect(patched.json().categoryId).toBeNull();
  });

  it('SEC-01: cliente recebe 403 ao listar fornecedores — documento e PIX são da equipe', async () => {
    atual = clienteCtx;
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/suppliers' });
      expect(res.statusCode).toBe(403);
    } finally {
      atual = ctx;
    }
  });
});

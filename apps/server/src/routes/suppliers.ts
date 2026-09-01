import {
  addSupplierExpense,
  createSupplier,
  deleteSupplierExpense,
  getGroupResult,
  getSupplierFile,
  listGroupExpenses,
  registerSupplierPayment,
  updateSupplier,
} from '@expedition/application';
import {
  formatCnpj,
  formatCpf,
  formatPixKey,
  parseCnpj,
  parseCpf,
  type PixKeyType,
} from '@expedition/domain';
import { z } from 'zod';
import type {
  GroupExpenseRow,
  GroupResultView,
  SupplierExpenseRecord,
  SupplierFile,
  SupplierFilePayment,
  SupplierFileSaida,
  SupplierPaymentRecord,
  SupplierRecord,
} from '@expedition/application';
import type { LocalDate } from '@expedition/domain';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * Rotas de fornecedor e financeiro do grupo (FO-01 · GR-08/09/10): cadastrar fornecedor,
 * lançar gasto no grupo, pagar fornecedor e ler o resultado (receita − gastos, margem).
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'esperado YYYY-MM-DD');

const supplierBody = z.object({
  name: z.string().trim().min(1),
  doc: z.string().optional(),
  docType: z.enum(['cpf', 'cnpj']).optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
  pixKey: z.string().optional(),
  categoryId: z.string().min(1).optional(),
});

const supplierPatchBody = z.object({
  name: z.string().trim().min(1).optional(),
  doc: z.string().nullable().optional(),
  docType: z.enum(['cpf', 'cnpj']).optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  pixKey: z.string().nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
});

const expenseBody = z.object({
  supplierId: z.string().min(1),
  description: z.string().trim().min(1),
  totalCents: z.number().int().positive(),
});

const supplierPaymentBody = z.object({
  amountCents: z.number().int().positive(),
  method: z.enum(['pix', 'boleto', 'card', 'cash']),
  paidAt: isoDate,
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export function registerSupplierRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post('/v1/suppliers', { schema: { body: supplierBody } }, async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const supplier = await createSupplier({ suppliers: deps.suppliers }, ctx, request.body);
    return reply.status(201).send(supplierDto(supplier));
  });

  typed.get('/v1/suppliers', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const rows = await deps.suppliers.listSuppliers(ctx.tenantId);
    return reply.send(rows.map(supplierDto));
  });

  // FO-04 — edição do fornecedor (nome, contato, documento, observações, categoria)
  typed.patch(
    '/v1/suppliers/:id',
    { schema: { params: z.object({ id: z.string().min(1) }), body: supplierPatchBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const supplier = await updateSupplier({ suppliers: deps.suppliers }, ctx, {
        id: request.params.id,
        ...request.body,
      });
      return reply.send(supplierDto(supplier));
    },
  );

  typed.post(
    '/v1/groups/:groupId/expenses',
    { schema: { params: z.object({ groupId: z.string().min(1) }), body: expenseBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const expense = await addSupplierExpense(
        { suppliers: deps.suppliers, schedule: deps.schedule },
        ctx,
        { groupId: request.params.groupId, ...request.body },
      );
      return reply.status(201).send(expenseDto(expense));
    },
  );

  typed.post(
    '/v1/expenses/:expenseId/payments',
    { schema: { params: z.object({ expenseId: z.string().min(1) }), body: supplierPaymentBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const payment = await registerSupplierPayment({ suppliers: deps.suppliers }, ctx, {
        expenseId: request.params.expenseId,
        ...request.body,
      });
      return reply.status(201).send(supplierPaymentDto(payment));
    },
  );

  // GR-18 — exclui um gasto lançado errado. Lógica: sai da leitura, fica na tabela.
  typed.delete(
    '/v1/expenses/:expenseId',
    { schema: { params: z.object({ expenseId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await deleteSupplierExpense({ suppliers: deps.suppliers, audit: deps.audit }, ctx, {
        expenseId: request.params.expenseId,
      });
      return reply.status(204).send();
    },
  );

  // FO-03 — ficha do fornecedor: saídas, pagamentos e dados fiscais numa leitura só
  typed.get(
    '/v1/suppliers/:id/file',
    { schema: { params: z.object({ id: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const file = await getSupplierFile(
        { suppliers: deps.suppliers, schedule: deps.schedule },
        ctx,
        { supplierId: request.params.id },
      );
      return reply.send(fileToDto(file));
    },
  );

  typed.get(
    '/v1/groups/:groupId/expenses',
    { schema: { params: z.object({ groupId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const rows = await listGroupExpenses({ suppliers: deps.suppliers }, ctx, {
        groupId: request.params.groupId,
      });
      return reply.send(rows.map(groupExpenseDto));
    },
  );

  typed.get(
    '/v1/groups/:groupId/result',
    { schema: { params: z.object({ groupId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const result = await getGroupResult(
        {
          schedule: deps.schedule,
          bookings: deps.bookings,
          payments: deps.payments,
          suppliers: deps.suppliers,
        },
        ctx,
        { groupId: request.params.groupId },
      );
      return reply.send(resultDto(result));
    },
  );
}

function supplierDto(supplier: SupplierRecord) {
  return {
    id: supplier.id,
    name: supplier.name,
    doc: formatDoc(supplier.doc, supplier.docType),
    docType: supplier.docType,
    phone: supplier.phone,
    email: supplier.email,
    /*
     * FO-07: a chave sai **formatada e inteira**, nunca mascarada. Ela existe para ser
     * copiada num app de banco — chave mascarada é chave inútil. A área de fornecedor é
     * só da equipe (SEC-01), que é a audiência autorizada.
     */
    pixKey: supplier.pixKey === null ? null : formatPixKey(asPixKey(supplier)),
    pixKeyRaw: supplier.pixKey,
    pixKeyType: supplier.pixKeyType,
    categoryId: supplier.categoryId,
    categoryName: supplier.categoryName,
  };
}

function expenseDto(expense: SupplierExpenseRecord) {
  return {
    id: expense.id,
    groupId: expense.groupId,
    supplierId: expense.supplierId,
    description: expense.description,
    totalCents: Number(expense.totalCents),
  };
}

function supplierPaymentDto(payment: SupplierPaymentRecord) {
  const p = payment.paidAt;
  return {
    id: payment.id,
    supplierExpenseId: payment.supplierExpenseId,
    amountCents: Number(payment.amountCents),
    method: payment.method,
    paidAt: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
  };
}

function resultDto(result: GroupResultView) {
  return { ...result };
}

/** DTO da ficha (FO-03): CPF do fornecedor mascarado, datas em ISO, valores em centavos. */
function fileToDto(file: SupplierFile) {
  return {
    supplier: {
      id: file.supplier.id,
      name: file.supplier.name,
      doc: formatDoc(file.supplier.doc, file.supplier.docType),
      docType: file.supplier.docType,
      phone: file.supplier.phone,
      email: file.supplier.email,
      notes: file.supplier.notes,
      categoryId: file.supplier.categoryId,
      categoryName: file.supplier.categoryName,
    },
    saidas: file.saidas.map(saidaDto),
    pagamentos: file.pagamentos.map(paymentDto),
    totals: {
      contractedCents: file.totals.contractedCents,
      paidCents: file.totals.paidCents,
      outstandingCents: file.totals.outstandingCents,
    },
  };
}

function saidaDto(saida: SupplierFileSaida) {
  return {
    groupId: saida.groupId,
    groupName: saida.groupName,
    startDate: isoDateOf(saida.startDate),
    endDate: isoDateOf(saida.endDate),
    contractedCents: saida.contractedCents,
    paidCents: saida.paidCents,
    outstandingCents: saida.outstandingCents,
  };
}

function paymentDto(payment: SupplierFilePayment) {
  return {
    id: payment.id,
    paidAt: isoDateOf(payment.paidAt),
    amountCents: payment.amountCents,
    method: payment.method,
    expenseDescription: payment.expenseDescription,
    groupName: payment.groupName,
  };
}

/** CPF do fornecedor é dado pessoal → mascarado por padrão (SEC-04). CNPJ é público. */
/**
 * Documento do fornecedor no back-office: **inteiro e pontuado**, como já era com o cliente
 * (decisão do dono). A área de fornecedor é só da equipe (SEC-01), que é a audiência
 * autorizada — documento mascarado ali é dado inútil para quem precisa conferir a nota
 * contra o cadastro. Portal e log seguem mascarando.
 */
function formatDoc(doc: string | null, docType: string | null): string | null {
  if (!doc) return null;
  /*
   * `parse` na leitura, não um cast: o documento foi validado na escrita, mas linha antiga
   * ou importada pode não estar. Documento que não parseia sai como veio — a tela mostra o
   * que está no banco em vez de estourar a ficha inteira por causa de um cadastro torto.
   */
  try {
    return docType === 'cpf' ? formatCpf(parseCpf(doc)) : formatCnpj(parseCnpj(doc));
  } catch {
    return doc;
  }
}

function isoDateOf(date: LocalDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function groupExpenseDto(row: GroupExpenseRow) {
  return {
    id: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    description: row.description,
    totalCents: row.totalCents,
    paidCents: row.paidCents,
    outstandingCents: row.outstandingCents,
  };
}

/** O par guardado no banco de volta ao tipo do domínio, para formatar na saída. */
function asPixKey(supplier: SupplierRecord) {
  return { type: supplier.pixKeyType as PixKeyType, value: supplier.pixKey ?? '' };
}

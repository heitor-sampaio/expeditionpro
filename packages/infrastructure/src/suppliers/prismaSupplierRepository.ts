import type {
  NewSupplier,
  NewSupplierCategory,
  NewSupplierExpense,
  NewSupplierPayment,
  SupplierCategoryRecord,
  SupplierExpenseRecord,
  SupplierPatch,
  SupplierPaymentRecord,
  SupplierRecord,
  SupplierRepository,
} from '@expedition/application';
import { cents, type LocalDate } from '@expedition/domain';
import type {
  Supplier as PrismaSupplier,
  SupplierExpense as PrismaExpense,
  SupplierPayment as PrismaPayment,
} from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma de fornecedores e do financeiro deles (GR-08..10). Dinheiro:
 * `Cents` (domínio) ↔ BigInt centavos (banco, §3.6); `paid_at` é `@db.Date`. Pago e
 * gasto são sempre somados a partir das linhas — nunca coluna.
 */
const categoryInclude = { category: { select: { name: true } } } as const;

export function prismaSupplierRepository(base: PrismaClient): SupplierRepository {
  return {
    async createSupplier(supplier: NewSupplier): Promise<SupplierRecord> {
      const row = await tenantClient(base, supplier.tenantId).supplier.create({
        data: supplierCreateData(supplier),
        include: categoryInclude,
      });
      return toSupplierRecord(row);
    },

    async updateSupplier(
      tenantId: string,
      id: string,
      patch: SupplierPatch,
    ): Promise<SupplierRecord> {
      const row = await tenantClient(base, tenantId).supplier.update({
        where: { id },
        data: supplierUpdateData(patch),
        include: categoryInclude,
      });
      return toSupplierRecord(row);
    },

    async findSupplierById(tenantId: string, id: string): Promise<SupplierRecord | null> {
      const row = await tenantClient(base, tenantId).supplier.findFirst({
        where: { id, deletedAt: null },
        include: categoryInclude,
      });
      return row ? toSupplierRecord(row) : null;
    },

    async findSupplierByDoc(tenantId: string, doc: string): Promise<SupplierRecord | null> {
      const row = await tenantClient(base, tenantId).supplier.findFirst({
        where: { doc, deletedAt: null },
        include: categoryInclude,
      });
      return row ? toSupplierRecord(row) : null;
    },

    async listSuppliers(tenantId: string): Promise<SupplierRecord[]> {
      const rows = await tenantClient(base, tenantId).supplier.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        include: categoryInclude,
      });
      return rows.map(toSupplierRecord);
    },

    async listCategories(tenantId: string): Promise<SupplierCategoryRecord[]> {
      const rows = await tenantClient(base, tenantId).supplierCategory.findMany({
        orderBy: { name: 'asc' },
      });
      return rows.map((c) => ({ id: c.id, name: c.name }));
    },

    async createCategory(category: NewSupplierCategory): Promise<SupplierCategoryRecord> {
      const row = await tenantClient(base, category.tenantId).supplierCategory.create({
        data: { tenantId: category.tenantId, name: category.name } satisfies Record<
          keyof NewSupplierCategory,
          unknown
        >,
      });
      return { id: row.id, name: row.name };
    },

    async findCategoryByName(
      tenantId: string,
      name: string,
    ): Promise<SupplierCategoryRecord | null> {
      const row = await tenantClient(base, tenantId).supplierCategory.findFirst({
        where: { name },
      });
      return row ? { id: row.id, name: row.name } : null;
    },

    async findCategoryById(tenantId: string, id: string): Promise<SupplierCategoryRecord | null> {
      const row = await tenantClient(base, tenantId).supplierCategory.findFirst({
        where: { id },
      });
      return row ? { id: row.id, name: row.name } : null;
    },

    async renameCategory(
      tenantId: string,
      id: string,
      name: string,
    ): Promise<SupplierCategoryRecord> {
      const row = await tenantClient(base, tenantId).supplierCategory.update({
        where: { id },
        data: { name },
      });
      return { id: row.id, name: row.name };
    },

    async deleteCategory(tenantId: string, id: string): Promise<void> {
      await tenantClient(base, tenantId).supplierCategory.delete({ where: { id } });
    },

    async countSuppliersByCategory(tenantId: string, categoryId: string): Promise<number> {
      // Usa o índice (tenant_id, category_id) que a migration do FO-04 já criou.
      return tenantClient(base, tenantId).supplier.count({
        where: { categoryId, deletedAt: null },
      });
    },

    async addExpense(expense: NewSupplierExpense): Promise<SupplierExpenseRecord> {
      const row = await tenantClient(base, expense.tenantId).supplierExpense.create({
        data: {
          tenantId: expense.tenantId,
          groupId: expense.groupId,
          supplierId: expense.supplierId,
          description: expense.description,
          totalCents: BigInt(expense.totalCents),
        } satisfies Record<keyof NewSupplierExpense, unknown>,
      });
      return toExpenseRecord(row);
    },

    async findExpenseById(
      tenantId: string,
      expenseId: string,
    ): Promise<SupplierExpenseRecord | null> {
      const row = await tenantClient(base, tenantId).supplierExpense.findFirst({
        where: { id: expenseId, deletedAt: null },
      });
      return row ? toExpenseRecord(row) : null;
    },

    async listExpensesByGroup(tenantId: string, groupId: string): Promise<SupplierExpenseRecord[]> {
      const rows = await tenantClient(base, tenantId).supplierExpense.findMany({
        where: { groupId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toExpenseRecord);
    },

    async softDeleteExpense(tenantId: string, expenseId: string): Promise<void> {
      await tenantClient(base, tenantId).supplierExpense.update({
        where: { id: expenseId },
        data: { deletedAt: new Date() },
      });
    },

    async countPaymentsByExpense(tenantId: string, expenseId: string): Promise<number> {
      return tenantClient(base, tenantId).supplierPayment.count({
        where: { supplierExpenseId: expenseId, deletedAt: null },
      });
    },

    async listExpensesBySupplier(
      tenantId: string,
      supplierId: string,
    ): Promise<SupplierExpenseRecord[]> {
      const rows = await tenantClient(base, tenantId).supplierExpense.findMany({
        where: { supplierId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toExpenseRecord);
    },

    async addPayment(payment: NewSupplierPayment): Promise<SupplierPaymentRecord> {
      const row = await tenantClient(base, payment.tenantId).supplierPayment.create({
        data: {
          tenantId: payment.tenantId,
          supplierExpenseId: payment.supplierExpenseId,
          paidAt: localDateToDate(payment.paidAt),
          amountCents: BigInt(payment.amountCents),
          method: payment.method,
          reference: payment.reference,
          notes: payment.notes,
          createdBy: payment.createdBy,
        } satisfies Record<keyof NewSupplierPayment, unknown>,
      });
      return toPaymentRecord(row);
    },

    async listPaymentsByGroup(tenantId: string, groupId: string): Promise<SupplierPaymentRecord[]> {
      const rows = await tenantClient(base, tenantId).supplierPayment.findMany({
        where: { deletedAt: null, expense: { groupId } },
        orderBy: { paidAt: 'asc' },
      });
      return rows.map(toPaymentRecord);
    },

    async listPaymentsBySupplier(
      tenantId: string,
      supplierId: string,
    ): Promise<SupplierPaymentRecord[]> {
      const rows = await tenantClient(base, tenantId).supplierPayment.findMany({
        where: { deletedAt: null, expense: { supplierId } },
        orderBy: { paidAt: 'asc' },
      });
      return rows.map(toPaymentRecord);
    },
  };
}

/**
 * O `data` do Prisma é lista branca escrita à mão — a escolha certa (nunca espalhar o objeto
 * de entrada dentro de um `create`), mas ela silencia: campo esquecido não é erro de
 * compilação, o registro salva sem ele e a tela diz que deu certo. Foi assim que a chave PIX
 * (FO-07) gravou NULL com a suíte verde.
 *
 * `satisfies Record<keyof Port, unknown>` fecha isso: obriga a citar toda chave do port sem
 * mexer no tipo do literal, então o Prisma continua conferindo cada valor. Campo somado ao
 * port e esquecido aqui passa a ser erro de compilação.
 */
export function supplierCreateData(supplier: NewSupplier) {
  return {
    tenantId: supplier.tenantId,
    name: supplier.name,
    doc: supplier.doc,
    docType: supplier.docType,
    pixKey: supplier.pixKey,
    pixKeyType: supplier.pixKeyType,
    phone: supplier.phone,
    email: supplier.email,
    notes: supplier.notes,
    categoryId: supplier.categoryId,
  } satisfies Record<keyof NewSupplier, unknown>;
}

export function supplierUpdateData(patch: SupplierPatch) {
  return {
    name: patch.name,
    doc: patch.doc,
    docType: patch.docType,
    pixKey: patch.pixKey,
    pixKeyType: patch.pixKeyType,
    phone: patch.phone,
    email: patch.email,
    notes: patch.notes,
    categoryId: patch.categoryId,
  } satisfies Record<keyof SupplierPatch, unknown>;
}

function toSupplierRecord(
  row: PrismaSupplier & { category?: { name: string } | null },
): SupplierRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    doc: row.doc,
    docType: row.docType,
    pixKey: row.pixKey,
    pixKeyType: row.pixKeyType,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
  };
}

function toExpenseRecord(row: PrismaExpense): SupplierExpenseRecord {
  return {
    id: row.id,
    groupId: row.groupId,
    supplierId: row.supplierId,
    description: row.description,
    totalCents: cents(Number(row.totalCents)),
  };
}

function toPaymentRecord(row: PrismaPayment): SupplierPaymentRecord {
  return {
    id: row.id,
    supplierExpenseId: row.supplierExpenseId,
    paidAt: dateToLocalDate(row.paidAt),
    amountCents: cents(Number(row.amountCents)),
    method: row.method,
  };
}

function localDateToDate(date: LocalDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function dateToLocalDate(date: Date): LocalDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

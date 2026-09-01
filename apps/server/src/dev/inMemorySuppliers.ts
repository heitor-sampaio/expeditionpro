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

/** Fornecedores em memória — SÓ para dev sem banco e testes de rota. */
export function inMemorySuppliers(): SupplierRepository {
  const suppliers: (SupplierRecord & { tenantId: string })[] = [];
  const expenses: (SupplierExpenseRecord & { tenantId: string })[] = [];
  const payments: (SupplierPaymentRecord & { tenantId: string })[] = [];
  const categories: (SupplierCategoryRecord & { tenantId: string })[] = [];
  /** GR-18: ids de gasto excluídos logicamente — as leituras os ignoram, como o banco. */
  const deletedExpenses = new Set<string>();
  const deletedPayments = new Set<string>();

  let seq = 0;

  const nameOf = (tenantId: string, categoryId: string | null): string | null =>
    categoryId
      ? (categories.find((c) => c.tenantId === tenantId && c.id === categoryId)?.name ?? null)
      : null;

  /**
   * O nome da categoria é **derivado na leitura**, como o join do Prisma faz — nunca
   * gravado no fornecedor. Guardar o nome faria renomear uma categoria deixar de mudar
   * quem já apontava para ela.
   */
  const comCategoria = (s: SupplierRecord): SupplierRecord => ({
    ...s,
    categoryName: nameOf(s.tenantId, s.categoryId),
  });

  return {
    createSupplier(supplier: NewSupplier) {
      seq += 1;
      const record = { ...supplier, id: `dev-sup-${seq}`, categoryName: null };
      suppliers.push(record);
      return Promise.resolve(comCategoria(record));
    },
    updateSupplier(tenantId: string, id: string, patch: SupplierPatch) {
      const index = suppliers.findIndex((s) => s.tenantId === tenantId && s.id === id);
      const current = suppliers[index];
      if (!current) return Promise.reject(new Error('fornecedor inexistente'));
      const next = { ...current, ...patch };
      suppliers[index] = next;
      return Promise.resolve(comCategoria(next));
    },
    findSupplierById(tenantId: string, id: string) {
      const found = suppliers.find((s) => s.tenantId === tenantId && s.id === id);
      return Promise.resolve(found ? comCategoria(found) : null);
    },
    findSupplierByDoc(tenantId: string, doc: string) {
      const found = suppliers.find((s) => s.tenantId === tenantId && s.doc === doc);
      return Promise.resolve(found ? comCategoria(found) : null);
    },
    listSuppliers(tenantId: string) {
      return Promise.resolve(suppliers.filter((s) => s.tenantId === tenantId).map(comCategoria));
    },
    listCategories(tenantId: string) {
      return Promise.resolve(
        categories.filter((c) => c.tenantId === tenantId).map((c) => ({ id: c.id, name: c.name })),
      );
    },
    createCategory(category: NewSupplierCategory) {
      seq += 1;
      const record = { id: `dev-cat-${seq}`, tenantId: category.tenantId, name: category.name };
      categories.push(record);
      return Promise.resolve({ id: record.id, name: record.name });
    },
    findCategoryByName(tenantId: string, name: string) {
      const found = categories.find((c) => c.tenantId === tenantId && c.name === name);
      return Promise.resolve(found ? { id: found.id, name: found.name } : null);
    },
    renameCategory(tenantId: string, id: string, name: string) {
      const index = categories.findIndex((c) => c.tenantId === tenantId && c.id === id);
      const current = categories[index];
      if (!current) return Promise.reject(new Error('categoria inexistente no fake'));
      const next = { ...current, name };
      categories[index] = next;
      return Promise.resolve({ id: next.id, name: next.name });
    },
    deleteCategory(tenantId: string, id: string) {
      const index = categories.findIndex((c) => c.tenantId === tenantId && c.id === id);
      if (index >= 0) categories.splice(index, 1);
      return Promise.resolve();
    },
    countSuppliersByCategory(tenantId: string, categoryId: string) {
      return Promise.resolve(
        suppliers.filter((s) => s.tenantId === tenantId && s.categoryId === categoryId).length,
      );
    },
    findCategoryById(tenantId: string, id: string) {
      const found = categories.find((c) => c.tenantId === tenantId && c.id === id);
      return Promise.resolve(found ? { id: found.id, name: found.name } : null);
    },
    addExpense(expense: NewSupplierExpense) {
      seq += 1;
      const record = {
        id: `dev-exp-${seq}`,
        tenantId: expense.tenantId,
        groupId: expense.groupId,
        supplierId: expense.supplierId,
        description: expense.description,
        totalCents: expense.totalCents,
      };
      expenses.push(record);
      return Promise.resolve(record);
    },
    findExpenseById(tenantId: string, expenseId: string) {
      const found = expenses.find(
        (e) => e.tenantId === tenantId && e.id === expenseId && !deletedExpenses.has(e.id),
      );
      return Promise.resolve(found ?? null);
    },
    listExpensesByGroup(tenantId: string, groupId: string) {
      return Promise.resolve(
        expenses.filter(
          (e) => e.tenantId === tenantId && e.groupId === groupId && !deletedExpenses.has(e.id),
        ),
      );
    },
    findPaymentById(tenantId: string, paymentId: string) {
      const found = payments.find(
        (x) => x.tenantId === tenantId && x.id === paymentId && !deletedPayments.has(x.id),
      );
      return Promise.resolve(found ?? null);
    },
    softDeletePayment(tenantId: string, paymentId: string) {
      void tenantId;
      deletedPayments.add(paymentId);
      return Promise.resolve();
    },
    softDeleteExpense(tenantId: string, expenseId: string) {
      void tenantId;
      deletedExpenses.add(expenseId);
      return Promise.resolve();
    },
    countPaymentsByExpense(tenantId: string, expenseId: string) {
      return Promise.resolve(
        payments.filter(
          (p) =>
            p.tenantId === tenantId &&
            !deletedPayments.has(p.id) &&
            p.supplierExpenseId === expenseId,
        ).length,
      );
    },
    listExpensesBySupplier(tenantId: string, supplierId: string) {
      return Promise.resolve(
        expenses.filter(
          (e) =>
            e.tenantId === tenantId && e.supplierId === supplierId && !deletedExpenses.has(e.id),
        ),
      );
    },
    addPayment(payment: NewSupplierPayment) {
      seq += 1;
      const record = {
        id: `dev-spay-${seq}`,
        tenantId: payment.tenantId,
        supplierExpenseId: payment.supplierExpenseId,
        paidAt: payment.paidAt,
        amountCents: payment.amountCents,
        method: payment.method,
      };
      payments.push(record);
      return Promise.resolve(record);
    },
    listPaymentsByGroup(tenantId: string, groupId: string) {
      const expenseIds = new Set(
        expenses.filter((e) => e.tenantId === tenantId && e.groupId === groupId).map((e) => e.id),
      );
      return Promise.resolve(
        payments.filter(
          (p) =>
            p.tenantId === tenantId &&
            !deletedPayments.has(p.id) &&
            expenseIds.has(p.supplierExpenseId),
        ),
      );
    },
    listPaymentsBySupplier(tenantId: string, supplierId: string) {
      const expenseIds = new Set(
        expenses
          .filter((e) => e.tenantId === tenantId && e.supplierId === supplierId)
          .map((e) => e.id),
      );
      return Promise.resolve(
        payments.filter(
          (p) =>
            p.tenantId === tenantId &&
            !deletedPayments.has(p.id) &&
            expenseIds.has(p.supplierExpenseId),
        ),
      );
    },
  };
}

import type { Cents, LocalDate } from '@expedition/domain';

/**
 * Port de fornecedores e do financeiro deles (§3.6, FO/GR-08..10). O pago a um
 * fornecedor é a SOMA de `supplier_payments`, nunca coluna; o gasto contratado é
 * `total_cents` do expense. Dinheiro em `Cents`; o infra converte para BigInt.
 */

export interface NewSupplier {
  readonly tenantId: string;
  readonly name: string;
  readonly doc: string | null;
  readonly docType: string | null; // cpf|cnpj
  /** FO-07: chave PIX normalizada, e o tipo descoberto na borda. */
  readonly pixKey: string | null;
  readonly pixKeyType: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly notes: string | null;
  readonly categoryId: string | null;
}

export interface SupplierRecord extends NewSupplier {
  readonly id: string;
  /** Nome da categoria (FO-04), resolvido por junção na leitura. */
  readonly categoryName: string | null;
}

/** Campos editáveis de um fornecedor (FO-04). */
export interface SupplierPatch {
  readonly name: string;
  readonly doc: string | null;
  readonly docType: string | null;
  readonly pixKey: string | null;
  readonly pixKeyType: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly notes: string | null;
  readonly categoryId: string | null;
}

export interface NewSupplierCategory {
  readonly tenantId: string;
  readonly name: string;
}

export interface SupplierCategoryRecord {
  readonly id: string;
  readonly name: string;
}

export interface NewSupplierExpense {
  readonly tenantId: string;
  readonly groupId: string;
  readonly supplierId: string;
  readonly description: string;
  readonly totalCents: Cents;
}

export interface SupplierExpenseRecord {
  readonly id: string;
  readonly groupId: string;
  readonly supplierId: string;
  readonly description: string;
  readonly totalCents: Cents;
}

export interface NewSupplierPayment {
  readonly tenantId: string;
  readonly supplierExpenseId: string;
  readonly paidAt: LocalDate;
  readonly amountCents: Cents;
  readonly method: string; // pix|boleto|card|cash
  readonly reference: string | null;
  readonly notes: string | null;
  readonly createdBy: string | null;
}

export interface SupplierPaymentRecord {
  readonly id: string;
  readonly supplierExpenseId: string;
  readonly paidAt: LocalDate;
  readonly amountCents: Cents;
  readonly method: string;
}

export interface SupplierRepository {
  createSupplier(supplier: NewSupplier): Promise<SupplierRecord>;
  updateSupplier(tenantId: string, id: string, patch: SupplierPatch): Promise<SupplierRecord>;
  findSupplierById(tenantId: string, id: string): Promise<SupplierRecord | null>;
  /** FO/GR-08: dedup por documento (existente vs novo). */
  findSupplierByDoc(tenantId: string, doc: string): Promise<SupplierRecord | null>;
  listSuppliers(tenantId: string): Promise<SupplierRecord[]>;

  // Categorias (FO-04) — dimensão do relatório de gastos por categoria.
  listCategories(tenantId: string): Promise<SupplierCategoryRecord[]>;
  createCategory(category: NewSupplierCategory): Promise<SupplierCategoryRecord>;
  findCategoryByName(tenantId: string, name: string): Promise<SupplierCategoryRecord | null>;
  findCategoryById(tenantId: string, id: string): Promise<SupplierCategoryRecord | null>;
  /** FO-05: renomeia. O nome do fornecedor é resolvido por junção, então alcança o histórico. */
  renameCategory(tenantId: string, id: string, name: string): Promise<SupplierCategoryRecord>;
  deleteCategory(tenantId: string, id: string): Promise<void>;
  /** FO-05: quantos fornecedores usam a categoria — a exclusão só passa com zero. */
  countSuppliersByCategory(tenantId: string, categoryId: string): Promise<number>;

  addExpense(expense: NewSupplierExpense): Promise<SupplierExpenseRecord>;
  findExpenseById(tenantId: string, expenseId: string): Promise<SupplierExpenseRecord | null>;
  listExpensesByGroup(tenantId: string, groupId: string): Promise<SupplierExpenseRecord[]>;
  /** GR-18: exclusão lógica do gasto. As leituras já filtram `deleted_at`. */
  softDeleteExpense(tenantId: string, expenseId: string): Promise<void>;
  /** GR-18: gasto com pagamento não se exclui — o dinheiro pago perderia o contratado. */
  countPaymentsByExpense(tenantId: string, expenseId: string): Promise<number>;
  /** FO-03: todos os gastos contratados com um fornecedor — para a ficha. */
  listExpensesBySupplier(tenantId: string, supplierId: string): Promise<SupplierExpenseRecord[]>;

  addPayment(payment: NewSupplierPayment): Promise<SupplierPaymentRecord>;
  /** Pagamentos a fornecedores de todo o grupo — para o "pago" e a margem (GR-10). */
  listPaymentsByGroup(tenantId: string, groupId: string): Promise<SupplierPaymentRecord[]>;
  /** GR-19: o pagamento pelo id, para auditar o valor antes de excluir. */
  findPaymentById(tenantId: string, paymentId: string): Promise<SupplierPaymentRecord | null>;
  /** GR-19: exclusão lógica do pagamento. As leituras já filtram `deleted_at`. */
  softDeletePayment(tenantId: string, paymentId: string): Promise<void>;
  /** FO-03: todos os pagamentos feitos a um fornecedor — para a ficha (extrato). */
  listPaymentsBySupplier(tenantId: string, supplierId: string): Promise<SupplierPaymentRecord[]>;
}

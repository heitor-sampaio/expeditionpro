-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "doc" TEXT,
    "doc_type" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_expenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "total_cents" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "supplier_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "supplier_expense_id" UUID NOT NULL,
    "paid_at" DATE NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_doc_key" ON "suppliers"("tenant_id", "doc");
CREATE INDEX "suppliers_tenant_id_idx" ON "suppliers"("tenant_id");
CREATE INDEX "supplier_expenses_tenant_id_group_id_idx" ON "supplier_expenses"("tenant_id", "group_id");
CREATE INDEX "supplier_payments_tenant_id_supplier_expense_id_idx" ON "supplier_payments"("tenant_id", "supplier_expense_id");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_expenses" ADD CONSTRAINT "supplier_expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_expenses" ADD CONSTRAINT "supplier_expenses_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_expenses" ADD CONSTRAINT "supplier_expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_expense_id_fkey" FOREIGN KEY ("supplier_expense_id") REFERENCES "supplier_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Isolamento multi-tenant por RLS (§2.2 · SEC-01)
-- ============================================================================
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "suppliers"
  USING ("tenant_id" = app.current_tenant_id()) WITH CHECK ("tenant_id" = app.current_tenant_id());

ALTER TABLE "supplier_expenses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "supplier_expenses"
  USING ("tenant_id" = app.current_tenant_id()) WITH CHECK ("tenant_id" = app.current_tenant_id());

ALTER TABLE "supplier_payments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "supplier_payments"
  USING ("tenant_id" = app.current_tenant_id()) WITH CHECK ("tenant_id" = app.current_tenant_id());

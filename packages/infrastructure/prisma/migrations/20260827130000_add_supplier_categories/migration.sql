-- §3.6 · FO-04: categoria de fornecedor, gerenciável por tenant. Dimensão do relatório de
-- gastos por categoria. Só a equipe acessa (fornecedor não é dado de cliente).

CREATE TABLE "supplier_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "supplier_categories_tenant_id_name_key" ON "supplier_categories"("tenant_id", "name");
CREATE INDEX "supplier_categories_tenant_id_idx" ON "supplier_categories"("tenant_id");

ALTER TABLE "supplier_categories" ADD CONSTRAINT "supplier_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "suppliers" ADD COLUMN "category_id" UUID;
CREATE INDEX "suppliers_tenant_id_category_id_idx" ON "suppliers"("tenant_id", "category_id");
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "supplier_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (§2.2 · SEC-01): só a equipe do tenant. Sem policy de cliente.
ALTER TABLE "supplier_categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "supplier_categories"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

-- CreateTable
CREATE TABLE "cashback_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "booking_id" UUID,
    "type" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "available_from" DATE,
    "expires_at" DATE,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashback_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cashback_entries_tenant_id_customer_id_idx" ON "cashback_entries"("tenant_id", "customer_id");
CREATE INDEX "cashback_entries_tenant_id_booking_id_idx" ON "cashback_entries"("tenant_id", "booking_id");

-- AddForeignKey
ALTER TABLE "cashback_entries" ADD CONSTRAINT "cashback_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cashback_entries" ADD CONSTRAINT "cashback_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Isolamento multi-tenant por RLS (§2.2 · SEC-01)
-- ============================================================================
ALTER TABLE "cashback_entries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "cashback_entries"
  USING ("tenant_id" = app.current_tenant_id()) WITH CHECK ("tenant_id" = app.current_tenant_id());

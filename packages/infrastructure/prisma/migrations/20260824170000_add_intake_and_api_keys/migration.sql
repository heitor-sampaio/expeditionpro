-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "last_used_at" TIMESTAMP(3),
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT,
    "payload" JSONB NOT NULL,
    "normalized" JSONB,
    "form_id" TEXT,
    "itinerary_id" UUID,
    "preferred_date" DATE,
    "submitted_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'received',
    "error" TEXT,
    "discarded_reason" TEXT,
    "allocated_group_id" UUID,
    "booking_id" UUID,
    "allocated_by" UUID,
    "allocated_at" TIMESTAMP(3),
    "is_test" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "intake_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX "api_keys_tenant_id_idx" ON "api_keys"("tenant_id");
CREATE UNIQUE INDEX "intake_events_tenant_id_source_external_id_key" ON "intake_events"("tenant_id", "source", "external_id");
CREATE INDEX "intake_events_tenant_id_status_idx" ON "intake_events"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "intake_events" ADD CONSTRAINT "intake_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Isolamento multi-tenant por RLS (§2.2 · SEC-01)
-- ============================================================================
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "api_keys"
  USING ("tenant_id" = app.current_tenant_id()) WITH CHECK ("tenant_id" = app.current_tenant_id());

ALTER TABLE "intake_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "intake_events"
  USING ("tenant_id" = app.current_tenant_id()) WITH CHECK ("tenant_id" = app.current_tenant_id());

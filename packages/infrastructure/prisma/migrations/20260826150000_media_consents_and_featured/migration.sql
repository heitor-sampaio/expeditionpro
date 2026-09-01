-- §5.12 · CO-10: consentimento de imagem (ledger por escopo) + CO-11: destaque no post.

ALTER TABLE "posts" ADD COLUMN "featured_at" TIMESTAMP(3);

CREATE TABLE "media_consents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_consents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "media_consents_tenant_id_customer_id_scope_idx" ON "media_consents"("tenant_id", "customer_id", "scope");
-- No máximo um consentimento ATIVO por (cliente, escopo).
CREATE UNIQUE INDEX "media_consents_active_unique" ON "media_consents"("tenant_id", "customer_id", "scope") WHERE "revoked_at" IS NULL;

ALTER TABLE "media_consents" ADD CONSTRAINT "media_consents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_consents" ADD CONSTRAINT "media_consents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS por audiência: equipe total; cliente lê o próprio (escopo família). Escrita mediada.
ALTER TABLE "media_consents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "media_consents"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');
CREATE POLICY customer_read ON "media_consents" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "customer_id" IN (SELECT app.current_family_ids())
  );

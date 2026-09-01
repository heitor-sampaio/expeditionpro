-- §5.13 · DOC-01..10: Termo de Adesão versionado + aceite (prova de consentimento LGPD).
-- Um documento por tenant (kind 'term'), versões imutáveis ao publicar, aceite por
-- (cliente, versão). A versão com aceite vinculado nunca é apagada (DOC-10) — sem cascade
-- de version→acceptance (Restrict).

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legal_document_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "content_json" JSONB NOT NULL DEFAULT '{}',
    "content_html" TEXT NOT NULL,
    "change_summary" TEXT,
    "requires_reacceptance" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "published_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "legal_document_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_acceptances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "booking_id" UUID,
    "accepted_at" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "pdf_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_tenant_id_kind_key" ON "legal_documents"("tenant_id", "kind");
CREATE INDEX "legal_documents_tenant_id_idx" ON "legal_documents"("tenant_id");
CREATE UNIQUE INDEX "legal_document_versions_document_id_version_number_key" ON "legal_document_versions"("document_id", "version_number");
CREATE INDEX "legal_document_versions_tenant_id_document_id_idx" ON "legal_document_versions"("tenant_id", "document_id");
CREATE UNIQUE INDEX "document_acceptances_document_version_id_customer_id_key" ON "document_acceptances"("document_version_id", "customer_id");
CREATE INDEX "document_acceptances_tenant_id_customer_id_idx" ON "document_acceptances"("tenant_id", "customer_id");

-- AddForeignKey
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_acceptances" ADD CONSTRAINT "document_acceptances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_acceptances" ADD CONSTRAINT "document_acceptances_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "legal_document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_acceptances" ADD CONSTRAINT "document_acceptances_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- RLS por audiência (§2.2 · §3.7 · SEC-01). Equipe: acesso total do tenant. Cliente:
-- lê o Termo **publicado** (nunca rascunho) e os **próprios** aceites (escopo família).
-- Escrita (editar, publicar, aceitar) é sempre mediada pelo servidor (Prisma/Extension).
-- ============================================================================
ALTER TABLE "legal_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_document_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_acceptances" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "legal_documents"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');
CREATE POLICY customer_read ON "legal_documents" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "is_active" = true
  );

CREATE POLICY tenant_isolation ON "legal_document_versions"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');
CREATE POLICY customer_read ON "legal_document_versions" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "published_at" IS NOT NULL
  );

CREATE POLICY tenant_isolation ON "document_acceptances"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');
CREATE POLICY customer_read ON "document_acceptances" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "customer_id" IN (SELECT app.current_family_ids())
  );

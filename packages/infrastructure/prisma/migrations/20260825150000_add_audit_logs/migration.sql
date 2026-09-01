-- §3.2.1 · A09 · SEC-04: trilha de auditoria das ações sensíveis (reorganização de
-- família, merge, futuramente chave de API e acesso a CPF completo). Append-only:
-- sem UPDATE nem DELETE no fluxo normal — a retenção (2 anos) é purga por data.

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "diff" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_entity_entity_id_idx" ON "audit_logs"("tenant_id", "entity", "entity_id");
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Isolamento multi-tenant por RLS (§2.2 · SEC-01). Auditoria é dado de equipe:
-- o cliente **nunca** lê audit_logs (nada de investigação exposta à audiência do
-- portal). Só a `tenant_isolation`, com o guarda de role que barra 'customer'.
-- ============================================================================
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "audit_logs"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

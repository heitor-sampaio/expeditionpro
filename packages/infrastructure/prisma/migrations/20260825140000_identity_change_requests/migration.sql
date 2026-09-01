-- PC-07: fila de aprovação de mudança de identidade (nome/CPF/nascimento).
-- Identidade define preço (faixa etária) e sai na nota — não é editável livremente.
-- O cliente pede a mudança; ela nasce `pending` e só a equipe aprova/recusa.

-- CreateTable
CREATE TABLE "identity_change_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "requested_by" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "full_name" TEXT,
    "cpf" TEXT,
    "birth_date" DATE,
    "reason" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "identity_change_requests_tenant_id_status_idx" ON "identity_change_requests"("tenant_id", "status");
CREATE INDEX "identity_change_requests_tenant_id_customer_id_idx" ON "identity_change_requests"("tenant_id", "customer_id");

-- AddForeignKey
ALTER TABLE "identity_change_requests" ADD CONSTRAINT "identity_change_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "identity_change_requests" ADD CONSTRAINT "identity_change_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Isolamento multi-tenant por RLS (§2.2 · SEC-01) + audiência do cliente (§3.7 / PC-05).
-- A tabela nasce depois da migration de RLS de cliente, então já entra com o guarda de
-- role na `tenant_isolation` (equipe) e uma `customer_read` (o cliente vê os pedidos da
-- própria família). A escrita — pedir, aprovar, recusar — é mediada pelo servidor.
-- ============================================================================
ALTER TABLE "identity_change_requests" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "identity_change_requests"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

CREATE POLICY customer_read ON "identity_change_requests" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "customer_id" IN (SELECT app.current_family_ids())
  );

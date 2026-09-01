-- IN-20: mapa form_id → roteiro por origem (Configurações → Integrações). O webhook
-- resolve o roteiro na chegada e a fila filtra os grupos do roteiro certo. É config do
-- tenant — só a equipe lê/escreve, então NÃO tem policy de cliente.

-- CreateTable
CREATE TABLE "form_mappings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "itinerary_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "form_mappings_tenant_id_source_form_id_key" ON "form_mappings"("tenant_id", "source", "form_id");
CREATE INDEX "form_mappings_tenant_id_idx" ON "form_mappings"("tenant_id");

-- AddForeignKey
ALTER TABLE "form_mappings" ADD CONSTRAINT "form_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_mappings" ADD CONSTRAINT "form_mappings_itinerary_id_fkey" FOREIGN KEY ("itinerary_id") REFERENCES "itineraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Isolamento multi-tenant por RLS (§2.2 · SEC-01). Config da integração: só a equipe
-- alcança; o cliente não tem nada aqui, então há só a `tenant_isolation` com o guarda de
-- role (sem `customer_read`). Escrita mediada pelo servidor.
-- ============================================================================
ALTER TABLE "form_mappings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "form_mappings"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

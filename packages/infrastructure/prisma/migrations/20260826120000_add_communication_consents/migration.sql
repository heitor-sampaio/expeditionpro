-- §5.9 · DOC-06 · CM-04: consentimento de comunicação por canal (marketing). Ledger:
-- conceder cria linha ativa; revogar (opt-out de 1 clique) carimba revoked_at. Histórico
-- nunca apagado — ônus da prova do consentimento é do controlador (LGPD).

CREATE TABLE "communication_consents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "communication_consents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "communication_consents_tenant_id_customer_id_channel_idx" ON "communication_consents"("tenant_id", "customer_id", "channel");
-- No máximo um consentimento ATIVO por (cliente, canal) — o resto é histórico revogado.
CREATE UNIQUE INDEX "communication_consents_active_unique" ON "communication_consents"("tenant_id", "customer_id", "channel") WHERE "revoked_at" IS NULL;

ALTER TABLE "communication_consents" ADD CONSTRAINT "communication_consents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_consents" ADD CONSTRAINT "communication_consents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- RLS por audiência (§2.2 · SEC-01). Equipe: total do tenant. Cliente: lê o próprio
-- consentimento (escopo família). Escrita (conceder/revogar) mediada pelo servidor.
-- ============================================================================
ALTER TABLE "communication_consents" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "communication_consents"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

CREATE POLICY customer_read ON "communication_consents" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "customer_id" IN (SELECT app.current_family_ids())
  );

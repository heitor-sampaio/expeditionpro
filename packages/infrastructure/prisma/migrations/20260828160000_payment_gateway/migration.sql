-- PG-01 · Gateway de pagamento (ASAAS): conexão do tenant e cobranças emitidas.
--
-- Duas tabelas, ambas **só da equipe**. O token do provedor dá acesso à conta financeira
-- do tenant, e a cobrança é operação de back-office: o cliente recebe o link pelo canal
-- de contato, não pelo banco (§3.7 — a audiência do cliente é a menor possível).

-- Conexão com o provedor. Uma por (tenant, provedor, ambiente): sandbox e produção
-- convivem, e reconectar atualiza a linha em vez de empilhar credencial velha.
CREATE TABLE "payment_integrations" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"     UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "provider"      TEXT NOT NULL DEFAULT 'asaas',
  "environment"   TEXT NOT NULL, -- sandbox | production
  -- Cifrado pela aplicação (AES-256-GCM). Nunca sai numa resposta de API.
  "access_token"  TEXT NOT NULL,
  -- Segredo que o provedor devolve em todo webhook: é o que autentica a chamada.
  "webhook_token" TEXT NOT NULL,
  "account_name"  TEXT,
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "connected_by"  UUID,
  "connected_at"  TIMESTAMP(3) NOT NULL DEFAULT now(),
  "last_checked_at" TIMESTAMP(3),
  CONSTRAINT "payment_integrations_tenant_provider_env_key"
    UNIQUE ("tenant_id", "provider", "environment")
);

CREATE INDEX "payment_integrations_tenant_idx" ON "payment_integrations" ("tenant_id");

-- Cobrança emitida para uma inscrição. `external_id` é o id no provedor — é por ele que
-- o webhook encontra a linha, então o unique é (tenant, provedor, external_id).
CREATE TABLE "payment_charges" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"          UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "booking_id"         UUID NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "provider"           TEXT NOT NULL DEFAULT 'asaas',
  "environment"        TEXT NOT NULL,
  "external_id"        TEXT NOT NULL,
  "amount_cents"       BIGINT NOT NULL,
  "billing_type"       TEXT NOT NULL, -- PIX | BOLETO | CREDIT_CARD
  "due_date"           DATE NOT NULL,
  "status"             TEXT NOT NULL DEFAULT 'pending',
  "invoice_url"        TEXT,
  -- Recebimento que esta cobrança gerou no ledger. Preenchido, o webhook não lança de
  -- novo: é o que torna o reenvio do provedor inofensivo.
  "booking_payment_id" UUID REFERENCES "booking_payments"("id") ON DELETE SET NULL,
  "paid_at"            TIMESTAMP(3),
  "created_by"         UUID,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "payment_charges_tenant_provider_external_key"
    UNIQUE ("tenant_id", "provider", "external_id")
);

CREATE INDEX "payment_charges_tenant_booking_idx" ON "payment_charges" ("tenant_id", "booking_id");
CREATE INDEX "payment_charges_tenant_status_idx" ON "payment_charges" ("tenant_id", "status");

ALTER TABLE "payment_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_charges" ENABLE ROW LEVEL SECURITY;

-- Só a equipe, nas duas: sem policy de cliente, nem de leitura.
CREATE POLICY tenant_isolation ON "payment_integrations"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

CREATE POLICY tenant_isolation ON "payment_charges"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

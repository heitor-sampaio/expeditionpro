-- CP-01..CP-10 · Cupons de desconto (§5.15).
--
-- Duas tabelas, ambas **só da equipe**: o cupom é instrumento comercial do tenant, e o
-- cliente nunca precisa ler a tabela — quando a auto-inscrição pelo app existir, quem
-- responde "este código vale?" é o servidor, não o banco (§3.7: a audiência do cliente
-- é a menor possível).
--
-- O desconto vive no RESGATE, nunca no `booking_participants`: o snapshot de categoria e
-- valor unitário é imutável (§3.4 · CP-05). E o uso do cupom é a CONTAGEM dos resgates
-- ativos, nunca uma coluna incrementada — mesmo raciocínio de saldo em §3.6.

-- O cupom. Escopo (itinerary/group), destinatário (customer), janela e limites são todos
-- opcionais: NULL significa "sem restrição".
CREATE TABLE "coupons" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code"        TEXT NOT NULL,
  "description" TEXT,
  "mode"        TEXT NOT NULL, -- percent | fixed
  -- Percentual inteiro (ex.: 10) ou centavos, conforme `mode`.
  "value"       BIGINT NOT NULL,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "valid_from"  DATE,
  "valid_until" DATE,
  "max_uses"              INTEGER,
  "max_uses_per_customer" INTEGER,
  "itinerary_id" UUID REFERENCES "itineraries"("id") ON DELETE CASCADE,
  "group_id"     UUID REFERENCES "groups"("id") ON DELETE CASCADE,
  "customer_id"  UUID REFERENCES "customers"("id") ON DELETE CASCADE,
  "created_by"  UUID,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT now(),
  "deleted_at"  TIMESTAMP(3),
  CONSTRAINT "coupons_tenant_code_key" UNIQUE ("tenant_id", "code"),
  -- O domínio já recusa isso (checkCoupon/calculateCouponDiscount), mas percentual acima
  -- de 100 ou valor negativo é dinheiro errado: o banco também recusa.
  CONSTRAINT "coupons_mode_check" CHECK ("mode" IN ('percent', 'fixed')),
  CONSTRAINT "coupons_value_check" CHECK (
    "value" >= 0 AND ("mode" <> 'percent' OR "value" <= 100)
  ),
  CONSTRAINT "coupons_window_check" CHECK (
    "valid_from" IS NULL OR "valid_until" IS NULL OR "valid_from" <= "valid_until"
  ),
  CONSTRAINT "coupons_max_uses_check" CHECK (
    ("max_uses" IS NULL OR "max_uses" > 0)
    AND ("max_uses_per_customer" IS NULL OR "max_uses_per_customer" > 0)
  )
);

CREATE INDEX "coupons_tenant_idx" ON "coupons" ("tenant_id");
CREATE INDEX "coupons_tenant_active_idx" ON "coupons" ("tenant_id", "active");

-- O resgate: o cupom aplicado a uma inscrição. `code`, `mode` e `value` ficam congelados
-- (CP-10) — editar ou desativar o cupom amanhã não muda o que esta inscrição valeu.
CREATE TABLE "coupon_redemptions" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"      UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "coupon_id"      UUID NOT NULL REFERENCES "coupons"("id") ON DELETE RESTRICT,
  "booking_id"     UUID NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "customer_id"    UUID NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "code"           TEXT NOT NULL,
  "mode"           TEXT NOT NULL,
  "value"          BIGINT NOT NULL,
  "discount_cents" BIGINT NOT NULL,
  "redeemed_by"    UUID,
  "redeemed_at"    TIMESTAMP(3) NOT NULL DEFAULT now(),
  "released_by"    UUID,
  "released_at"    TIMESTAMP(3),
  CONSTRAINT "coupon_redemptions_discount_check" CHECK ("discount_cents" >= 0)
);

CREATE INDEX "coupon_redemptions_tenant_coupon_idx"
  ON "coupon_redemptions" ("tenant_id", "coupon_id");
CREATE INDEX "coupon_redemptions_tenant_booking_idx"
  ON "coupon_redemptions" ("tenant_id", "booking_id");

-- CP-06: um cupom por inscrição. Só entre os resgates ATIVOS — liberar (released_at)
-- deixa a inscrição livre para receber outro cupom, e o histórico permanece.
CREATE UNIQUE INDEX "coupon_redemptions_active_booking_key"
  ON "coupon_redemptions" ("tenant_id", "booking_id")
  WHERE "released_at" IS NULL;

ALTER TABLE "coupons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coupon_redemptions" ENABLE ROW LEVEL SECURITY;

-- Só a equipe, nas duas. Cupom é instrumento comercial: um cliente que lesse a tabela
-- descobriria todo código promocional do tenant, inclusive os nominais de outra família.
CREATE POLICY tenant_isolation ON "coupons"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

CREATE POLICY tenant_isolation ON "coupon_redemptions"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cnpj" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "responsible_id" UUID,
    "full_name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "email" TEXT,
    "email_verified_at" TIMESTAMP(3),
    "phone" TEXT,
    "phone_verified_at" TIMESTAMP(3),
    "address_street" TEXT,
    "address_number" TEXT,
    "address_district" TEXT,
    "address_city" TEXT,
    "address_state" TEXT,
    "address_zip" TEXT,
    "notes" TEXT,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "auth_user_id" UUID,
    "portal_status" TEXT NOT NULL DEFAULT 'none',
    "invited_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_brands" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vehicle_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_models" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itineraries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "difficulty" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "kind" TEXT NOT NULL DEFAULT 'catalog',
    "child_young_max_age" INTEGER NOT NULL DEFAULT 5,
    "child_mid_max_age" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "itineraries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "memberships_tenant_id_idx" ON "memberships"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenant_id_user_id_key" ON "memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "customers_tenant_id_idx" ON "customers"("tenant_id");

-- CreateIndex
CREATE INDEX "customers_tenant_id_responsible_id_idx" ON "customers"("tenant_id", "responsible_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_cpf_key" ON "customers"("tenant_id", "cpf");

-- CreateIndex
CREATE INDEX "vehicle_brands_tenant_id_idx" ON "vehicle_brands"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_brands_tenant_id_name_key" ON "vehicle_brands"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "vehicle_models_tenant_id_idx" ON "vehicle_models"("tenant_id");

-- CreateIndex
CREATE INDEX "vehicle_models_tenant_id_brand_id_idx" ON "vehicle_models"("tenant_id", "brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_tenant_id_brand_id_name_key" ON "vehicle_models"("tenant_id", "brand_id", "name");

-- CreateIndex
CREATE INDEX "itineraries_tenant_id_idx" ON "itineraries"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "itineraries_tenant_id_slug_key" ON "itineraries"("tenant_id", "slug");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_brands" ADD CONSTRAINT "vehicle_brands_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "vehicle_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Isolamento multi-tenant por RLS (§2.2 · SEC-01)
-- ============================================================================
-- RLS habilitada em TODA tabela de negócio. As policies leem o tenant do JWT
-- (app_metadata.tenant_id), como o Supabase popula em request.jwt.claims.
-- Usamos current_setting em vez de auth.jwt() de propósito: a suíte de RLS roda
-- num Postgres puro no CI, sem depender do schema `auth` do Supabase.
--
-- Lembrete (§2.2): o role do Prisma tem BYPASSRLS. Esta camada NÃO protege por
-- essa via — o filtro do Prisma vem da Client Extension. RLS é a garantia do
-- acesso direto (portal via supabase-js) e a segunda trava do modelo.

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
  -- search_path fixo: função usada em policy de RLS não pode ser sequestrada por
  -- um schema malicioso à frente no search_path. Só usa objetos de pg_catalog.
  SET search_path = ''
  AS $$
    SELECT NULLIF(
      current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id',
      ''
    )::uuid
  $$;

-- tenants: a policy casa pela própria linha do tenant
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenants"
  USING ("id" = app.current_tenant_id())
  WITH CHECK ("id" = app.current_tenant_id());

-- memberships
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "memberships"
  USING ("tenant_id" = app.current_tenant_id())
  WITH CHECK ("tenant_id" = app.current_tenant_id());

-- customers
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "customers"
  USING ("tenant_id" = app.current_tenant_id())
  WITH CHECK ("tenant_id" = app.current_tenant_id());

-- vehicle_brands
ALTER TABLE "vehicle_brands" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "vehicle_brands"
  USING ("tenant_id" = app.current_tenant_id())
  WITH CHECK ("tenant_id" = app.current_tenant_id());

-- vehicle_models
ALTER TABLE "vehicle_models" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "vehicle_models"
  USING ("tenant_id" = app.current_tenant_id())
  WITH CHECK ("tenant_id" = app.current_tenant_id());

-- itineraries
ALTER TABLE "itineraries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "itineraries"
  USING ("tenant_id" = app.current_tenant_id())
  WITH CHECK ("tenant_id" = app.current_tenant_id());

-- ============================================================================
-- Hierarquia familiar de exatamente dois níveis (CL-11 · §3.2)
-- ============================================================================
-- Acompanhante nunca tem acompanhante. Garantido por trigger, não só por
-- validação de formulário.

CREATE OR REPLACE FUNCTION enforce_two_level_family() RETURNS trigger
  LANGUAGE plpgsql
  -- search_path fixo (hardening). Com ele vazio, os nomes são qualificados: public.customers.
  SET search_path = ''
  AS $$
  BEGIN
    IF NEW.responsible_id IS NOT NULL THEN
      IF NEW.responsible_id = NEW.id THEN
        RAISE EXCEPTION 'cliente não pode ser responsável por si mesmo';
      END IF;
      -- o destino precisa ser um responsável (responsible_id IS NULL): dois níveis
      IF EXISTS (
        SELECT 1 FROM public.customers r
        WHERE r.id = NEW.responsible_id AND r.responsible_id IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'família de dois níveis: acompanhante (%) não pode ter acompanhante', NEW.responsible_id;
      END IF;
      -- quem já é responsável de alguém não pode virar acompanhante (não cria órfão)
      IF EXISTS (SELECT 1 FROM public.customers c WHERE c.responsible_id = NEW.id) THEN
        RAISE EXCEPTION 'cliente % já é responsável e não pode virar acompanhante', NEW.id;
      END IF;
    END IF;
    RETURN NEW;
  END;
  $$;

CREATE TRIGGER trg_two_level_family
  BEFORE INSERT OR UPDATE OF responsible_id ON "customers"
  FOR EACH ROW EXECUTE FUNCTION enforce_two_level_family();

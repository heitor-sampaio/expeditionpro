-- Policies de RLS por audiência: role = customer (§3.7 / PC-05).
--
-- Hoje toda tabela tem UMA policy `tenant_isolation` PERMISSIVE para {public}. Como
-- policies permissivas são OR, um JWT de cliente com `app_metadata.tenant_id` leria o
-- tenant INTEIRO — fornecedores, margem, todas as famílias. Esta migration:
--   1. adiciona helpers para role e customer_id do JWT;
--   2. restringe `tenant_isolation` a NÃO-cliente (equipe/integração);
--   3. dá ao cliente policies próprias, SELECT-only, escopadas à própria FAMÍLIA;
--   4. NÃO dá policy de cliente em suppliers/margem/api_keys/intake/memberships/tenants
--      — lá o cliente lê zero linha (PC-05).
-- Escrita do cliente continua mediada pelo servidor (Prisma BYPASSRLS + Extension).
--
-- Rollback: DROP POLICY customer_read em cada tabela; restaurar `tenant_isolation` sem
-- o guarda de role; DROP das funções app.current_role/customer_id/family_*.

-- 1. Claims do JWT ------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.current_role() RETURNS text
  LANGUAGE sql STABLE SET search_path = ''
  AS $$
    SELECT NULLIF(
      current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role',
      ''
    )::text
  $$;

CREATE OR REPLACE FUNCTION app.current_customer_id() RETURNS uuid
  LANGUAGE sql STABLE SET search_path = ''
  AS $$
    SELECT NULLIF(
      current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'customer_id',
      ''
    )::uuid
  $$;

-- 2. Família do cliente logado (SECURITY DEFINER: contorna a RLS para não recorrer) --
-- O "chefe" da família é o responsável — ou o próprio cliente, se já é responsável.
-- search_path fixo e só objetos qualificados: função de policy não pode ser sequestrada.

CREATE OR REPLACE FUNCTION app.current_family_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $$
    WITH me AS (
      SELECT id, responsible_id FROM public.customers WHERE id = app.current_customer_id()
    ), head AS (
      SELECT COALESCE((SELECT responsible_id FROM me), (SELECT id FROM me)) AS id
    )
    SELECT c.id
    FROM public.customers c, head
    WHERE head.id IS NOT NULL AND (c.id = head.id OR c.responsible_id = head.id)
  $$;

CREATE OR REPLACE FUNCTION app.current_family_booking_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $$
    SELECT b.id FROM public.bookings b
    WHERE b.responsible_customer_id IN (SELECT app.current_family_ids())
  $$;

CREATE OR REPLACE FUNCTION app.current_family_group_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $$
    SELECT DISTINCT b.group_id FROM public.bookings b
    WHERE b.id IN (SELECT app.current_family_booking_ids())
  $$;

-- 3. `tenant_isolation` passa a valer só para NÃO-cliente ---------------------
-- `IS DISTINCT FROM 'customer'` cobre role NULL (integração/serviço) — só o cliente sai.

ALTER POLICY tenant_isolation ON "tenants"
  USING ("id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "memberships"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "customers"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "vehicles"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "vehicle_brands"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "vehicle_models"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "itineraries"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "itinerary_prices"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "schedule_events"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "groups"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "bookings"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "booking_participants"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "booking_payments"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "suppliers"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "supplier_expenses"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "supplier_payments"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "cashback_entries"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "intake_events"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER POLICY tenant_isolation ON "api_keys"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

-- 4. Policies do cliente: SELECT, escopadas à própria família ----------------
-- Núcleo da família (o cliente só enxerga a si e à própria família):

CREATE POLICY customer_read ON "customers" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "id" IN (SELECT app.current_family_ids())
  );

CREATE POLICY customer_read ON "vehicles" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "customer_id" IN (SELECT app.current_family_ids())
  );

CREATE POLICY customer_read ON "bookings" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "id" IN (SELECT app.current_family_booking_ids())
  );

CREATE POLICY customer_read ON "booking_participants" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "booking_id" IN (SELECT app.current_family_booking_ids())
  );

CREATE POLICY customer_read ON "booking_payments" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "booking_id" IN (SELECT app.current_family_booking_ids())
  );

CREATE POLICY customer_read ON "cashback_entries" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "customer_id" IN (SELECT app.current_family_ids())
  );

-- Contexto das saídas da família (para o portal mostrar roteiro/datas):

CREATE POLICY customer_read ON "groups" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "id" IN (SELECT app.current_family_group_ids())
  );

CREATE POLICY customer_read ON "schedule_events" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "id" IN (
      SELECT g.schedule_event_id FROM public.groups g
      WHERE g.id IN (SELECT app.current_family_group_ids())
    )
  );

CREATE POLICY customer_read ON "itineraries" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "id" IN (
      SELECT g.itinerary_id FROM public.groups g
      WHERE g.id IN (SELECT app.current_family_group_ids())
    )
  );

CREATE POLICY customer_read ON "itinerary_prices" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "itinerary_id" IN (
      SELECT g.itinerary_id FROM public.groups g
      WHERE g.id IN (SELECT app.current_family_group_ids())
    )
  );

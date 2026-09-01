-- RO-07 · §3.5.1 — a vitrine é o catálogo, e a apresentação precisa da ficha.
--
-- Duas correções sobre a migration anterior (`gallery_is_catalog`):
--
-- 1. **`kind` entra na regra.** `app.active_itinerary_ids()` olhava só `status = 'active'`,
--    mas roteiro `custom` é saída fechada, negociada com um grupo — o PRD (§3.5.1) o mantém
--    fora da vitrine e dos filtros públicos. Só com `status`, a foto de uma saída fechada
--    apareceria para qualquer cliente do tenant: quem não está naquela saída não deve nem
--    saber que ela existe.
--
-- 2. **A ficha do roteiro abre junto com a foto.** A galeria vive dentro da apresentação do
--    roteiro; foto sem nome e sem descrição não é apresentação. Sem isso o app teria a
--    imagem e nada para rotulá-la.
--
-- O que NÃO abre: `itinerary_prices`, `schedule_events`, `groups`. O cliente lê o preço da
-- própria saída (§3.7); a tabela de preços do catálogo é decisão comercial, não vitrine.
--
-- `SECURITY DEFINER` com `search_path` fixo e objetos qualificados, como
-- `app.current_family_ids()`: checagem de policy que atravessa outra tabela precisa disso,
-- senão herda o escopo da tabela atravessada — em silêncio, porque RLS não levanta erro.

CREATE OR REPLACE FUNCTION app.active_itinerary_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $$
    SELECT i.id FROM public.itineraries i
    WHERE i.tenant_id = app.current_tenant_id()
      AND i.status = 'active'
      AND i.kind = 'catalog'
  $$;

-- Roteiros das saídas da própria família: preserva a ficha e as fotos da viagem já feita,
-- mesmo que o roteiro seja `custom` ou tenha sido arquivado depois (PC-09).
CREATE OR REPLACE FUNCTION app.current_family_itinerary_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $$
    SELECT DISTINCT g.itinerary_id FROM public.groups g
    WHERE g.id IN (SELECT app.current_family_group_ids())
  $$;

DROP POLICY IF EXISTS customer_read ON "itinerary_photos";

CREATE POLICY customer_read ON "itinerary_photos" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND (
      "itinerary_id" IN (SELECT app.active_itinerary_ids())
      OR "itinerary_id" IN (SELECT app.current_family_itinerary_ids())
    )
  );

DROP POLICY IF EXISTS customer_read ON "itineraries";

CREATE POLICY customer_read ON "itineraries" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND (
      "id" IN (SELECT app.active_itinerary_ids())
      OR "id" IN (SELECT app.current_family_itinerary_ids())
    )
  );

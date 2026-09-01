-- RO-01 · PC-09: a galeria do roteiro é **catálogo**, não contexto da viagem.
--
-- A policy anterior dizia "foto de roteiro ativo do tenant" e checava isso com
-- `EXISTS (SELECT 1 FROM itineraries ...)`. Só que essa subconsulta **também passa pela
-- RLS**: a policy de `itineraries` escopa o cliente aos roteiros que ele contratou, então
-- o EXISTS dava falso e a galeria vinha vazia para quem ainda não viajou. A policy não
-- fazia o que estava escrito nela — e o modo de falhar era silencioso, porque RLS não
-- levanta erro, só devolve menos linhas.
--
-- A checagem sai por função SECURITY DEFINER, como já é feito para a família
-- (`app.current_family_ids`). `search_path` fixo e objetos qualificados: função usada em
-- policy não pode ser sequestrada por um schema no caminho de busca.
--
-- O que isso abre: fotos de roteiro **ativo** do próprio tenant, para quem já tem conta.
-- Foto de roteiro publicado é material de venda — não é margem, não é fornecedor, não é
-- dado de outra família. O que continua fechado é tudo o mais: preço, saída, inscrição.

CREATE OR REPLACE FUNCTION app.active_itinerary_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $$
    SELECT i.id FROM public.itineraries i
    WHERE i.tenant_id = app.current_tenant_id()
      AND i.status = 'active'
  $$;

DROP POLICY IF EXISTS customer_read ON "itinerary_photos";

CREATE POLICY customer_read ON "itinerary_photos" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "itinerary_id" IN (SELECT app.active_itinerary_ids())
  );

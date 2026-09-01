-- Configuração do Supabase que NÃO é gerenciada pelo Prisma (schema `storage`, publicações
-- de Realtime). Rode UMA vez por projeto Supabase, DEPOIS das migrations do Prisma. Idempotente.
--
--   psql "$DATABASE_URL" -f packages/infrastructure/prisma/supabase-setup.sql
--   (ou cole no SQL Editor do Supabase)

-- ── §5.12 · CO-09: bucket privado da comunidade (16 MB, só imagens) ──────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('community', 'community', false, 16777216, ARRAY['image/webp','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = EXCLUDED.public;

-- Policies de Storage: upload/leitura/remoção só no prefixo `{tenant_id}/` do próprio JWT.
DROP POLICY IF EXISTS "community_insert_own_tenant" ON storage.objects;
CREATE POLICY "community_insert_own_tenant" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

DROP POLICY IF EXISTS "community_read_own_tenant" ON storage.objects;
CREATE POLICY "community_read_own_tenant" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'community'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

DROP POLICY IF EXISTS "community_delete_own_tenant" ON storage.objects;
CREATE POLICY "community_delete_own_tenant" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'community'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

-- ── §3.5 · RO-01: bucket privado da galeria de roteiros (16 MB, só imagens) ──────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('itineraries', 'itineraries', false, 16777216, ARRAY['image/webp','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = EXCLUDED.public;

DROP POLICY IF EXISTS "itineraries_insert_own_tenant" ON storage.objects;
CREATE POLICY "itineraries_insert_own_tenant" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'itineraries'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

DROP POLICY IF EXISTS "itineraries_read_own_tenant" ON storage.objects;
CREATE POLICY "itineraries_read_own_tenant" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'itineraries'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

DROP POLICY IF EXISTS "itineraries_delete_own_tenant" ON storage.objects;
CREATE POLICY "itineraries_delete_own_tenant" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'itineraries'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

-- ── §3.6/§5.8: Realtime nas inscrições (mesa do grupo, fila e portal) ────────────────
-- A publicação entrega a mudança; a **RLS decide quem recebe** — a equipe vê o tenant, o
-- cliente só a própria família. Sem isso a tela precisa de F5 para ver o que outra pessoa
-- acabou de lançar.
DO $
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bookings', 'booking_participants', 'booking_payments',
    'intake_events', 'groups', 'schedule_events', 'cashback_entries',
    'payment_charges'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $;

-- ── §5.12 · CO-04: Realtime ao vivo em curtidas e comentários ────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'post_likes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'post_comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;
  END IF;
END $$;

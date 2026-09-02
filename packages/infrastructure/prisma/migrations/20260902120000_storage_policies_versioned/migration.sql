-- SEC — as policies de Storage saem do painel e entram no repositório, e a de exclusão
-- deixa de valer para cliente.
--
-- **Por que versionar.** As seis policies dos buckets `community` e `itineraries` existiam
-- só no painel do Supabase. Ninguém conseguia revisá-las num diff, o `check:rls` não as
-- enxerga (ele lê as migrations) e recriar o ambiente dependia de alguém lembrar de clicar
-- nos lugares certos. Regra de acesso que não está no repositório é regra que ninguém
-- revisa.
--
-- **O que estava errado.** `DELETE` era `TO authenticated` com apenas a checagem de tenant.
-- Cliente é `authenticated`: com a própria sessão, chamando a API de Storage direto (sem
-- passar pelo nosso servidor), um cliente apagava **qualquer** foto do tenant — a capa dos
-- roteiros, as fotos da comunidade de outras famílias. Não é roubo de dado, é destruição, e
-- sem rastro nenhum do nosso lado.
--
-- Ninguém no aplicativo precisa disso: só `ItineraryScreen` apaga arquivo, e é tela de
-- back-office. A comunidade nunca apaga — remover post é exclusão lógica, a mídia fica.
--
-- **Por que a checagem lê `memberships`, e não `app_metadata`.** Desde o SEC-17 o papel
-- vigente vive no banco; o `app_metadata` do login guarda a audiência e pode ficar
-- desatualizado — quem foi rebaixado de admin para viewer continua com `role: admin` lá.
-- Uma policy que confiasse no token daria a essa pessoa o direito de apagar arquivo depois
-- de perdê-lo em todo o resto do sistema.

-- `SECURITY DEFINER` porque a função lê `memberships`, e a RLS daquela tabela filtraria a
-- subconsulta pelo próprio escopo do chamador — a checagem voltaria vazia e falharia em
-- silêncio, que é exatamente como este projeto já se queimou uma vez.
CREATE OR REPLACE FUNCTION app.can_manage_media()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.tenant_id = app.current_tenant_id()
      AND m.user_id = NULLIF(
        current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
        ''
      )::uuid
      -- `viewer` fica de fora: é somente leitura em todo o resto do sistema (A2).
      AND m.role IN ('owner', 'admin', 'operator')
  );
$$;

REVOKE ALL ON FUNCTION app.can_manage_media() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_manage_media() TO authenticated;

-- As policies de Storage só existem onde existe Storage. No CI o banco é um `postgres:17`
-- cru, sem o schema `storage`, e este bloco vira no-op — mesma regra do backfill do SEC-17.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    -- Recriadas por nome para que o estado do banco passe a ser o deste arquivo, e não o
    -- que sobrou de cliques no painel.
    DROP POLICY IF EXISTS community_read_own_tenant ON storage.objects;
    DROP POLICY IF EXISTS community_insert_own_tenant ON storage.objects;
    DROP POLICY IF EXISTS community_delete_own_tenant ON storage.objects;
    DROP POLICY IF EXISTS itineraries_read_own_tenant ON storage.objects;
    DROP POLICY IF EXISTS itineraries_insert_own_tenant ON storage.objects;
    DROP POLICY IF EXISTS itineraries_delete_own_tenant ON storage.objects;

    -- Ler e enviar: qualquer pessoa autenticada do tenant. O feed da comunidade é do tenant
    -- inteiro, e o cliente precisa enviar a foto do próprio post.
    CREATE POLICY community_read_own_tenant ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'community'
        AND (storage.foldername(name))[1] = app.current_tenant_id()::text
      );

    CREATE POLICY community_insert_own_tenant ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'community'
        AND (storage.foldername(name))[1] = app.current_tenant_id()::text
      );

    CREATE POLICY itineraries_read_own_tenant ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'itineraries'
        AND (storage.foldername(name))[1] = app.current_tenant_id()::text
      );

    CREATE POLICY itineraries_insert_own_tenant ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'itineraries'
        AND (storage.foldername(name))[1] = app.current_tenant_id()::text
      );

    -- Apagar: só quem administra mídia. Era aqui que o cliente entrava.
    CREATE POLICY community_delete_own_tenant ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'community'
        AND (storage.foldername(name))[1] = app.current_tenant_id()::text
        AND app.can_manage_media()
      );

    CREATE POLICY itineraries_delete_own_tenant ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'itineraries'
        AND (storage.foldername(name))[1] = app.current_tenant_id()::text
        AND app.can_manage_media()
      );
  END IF;
END $$;

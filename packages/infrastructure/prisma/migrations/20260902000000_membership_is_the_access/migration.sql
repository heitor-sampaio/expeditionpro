-- SEC-17 — `memberships` passa a ser a fonte da verdade de quem tem acesso.
--
-- A tabela existe desde a migration inicial e nunca foi escrita: o papel vivia só no
-- `app_metadata` do login do Supabase. Consequência prática: não havia como listar quem
-- entra no sistema, não havia como tirar o acesso de ninguém pelo ExpeditionPRO, e um
-- token já emitido seguia valendo até expirar — até uma hora de acesso para quem foi
-- desligado.
--
-- O e-mail vem junto, desnormalizado de propósito: sem ele a lista exigiria uma chamada
-- à Admin API do Supabase por linha, e a tela de "quem tem acesso" viraria uma lista de
-- UUIDs.
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "email" TEXT;

-- Backfill de quem já entra no sistema.
--
-- Sem isto, o primeiro deploy que passar a exigir a linha de acesso tranca **todo mundo**
-- para fora, o dono inclusive — ninguém tem linha, porque nunca ninguém escreveu nenhuma.
--
-- Condicional ao schema `auth` existir: no Supabase ele existe e traz os usuários; no CI
-- o banco é um `postgres:17` cru e o bloco vira no-op. As policies deste projeto usam
-- `current_setting` justamente para não depender de `auth`, e o backfill segue a mesma
-- regra — uma migration que só roda num ambiente não é uma migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    INSERT INTO "memberships" ("id", "tenant_id", "user_id", "role", "email", "created_at")
    SELECT
      gen_random_uuid(),
      (u.raw_app_meta_data ->> 'tenant_id')::uuid,
      u.id,
      u.raw_app_meta_data ->> 'role',
      u.email,
      COALESCE(u.created_at, now())
    FROM auth.users u
    WHERE u.raw_app_meta_data ->> 'role' IN ('owner', 'admin', 'operator', 'viewer')
      AND (u.raw_app_meta_data ->> 'tenant_id') IS NOT NULL
      -- Um tenant que não existe mais não vira linha órfã: a FK recusaria de todo jeito.
      AND EXISTS (
        SELECT 1 FROM "tenants" t WHERE t.id = (u.raw_app_meta_data ->> 'tenant_id')::uuid
      )
    ON CONFLICT ("tenant_id", "user_id") DO NOTHING;
  END IF;
END $$;

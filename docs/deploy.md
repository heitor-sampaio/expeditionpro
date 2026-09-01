# Provisionamento do banco (Supabase/Postgres)

O schema tem **três camadas** que precisam ser aplicadas na ordem certa. Duas são do
Prisma (migrations); a terceira é config do Supabase que o Prisma não gerencia (bucket de
Storage e publicação de Realtime).

Todos os comandos rodam de `packages/infrastructure` com `DATABASE_URL` apontando para o
banco alvo (a connection string do projeto Supabase; no dev, o `.env` local).

## 1. Ambiente NOVO (projeto Supabase do zero)

```bash
pnpm --filter @expedition/infrastructure db:migrate:deploy   # aplica as 15 migrations e as registra
pnpm --filter @expedition/infrastructure db:supabase-setup   # bucket community + policies + Realtime
pnpm --filter @expedition/infrastructure db:seed             # catálogo/tenant zero (opcional)
```

`migrate deploy` cria o schema **e** grava tudo em `_prisma_migrations` — não precisa de baseline.

## 2. Ambiente que foi montado via MCP `apply_migration` (o caso do projeto atual, `drk`)

Durante o desenvolvimento, várias migrations foram aplicadas via MCP direto no banco, então
o **schema existe** mas parte dele **não está registrada** em `_prisma_migrations`. Sem
consertar, um `migrate deploy` tentaria recriar tabelas que já existem e falharia.

```bash
pnpm --filter @expedition/infrastructure db:baseline:dry     # mostra o que falta registrar
pnpm --filter @expedition/infrastructure db:baseline         # registra as faltantes (idempotente)
pnpm --filter @expedition/infrastructure db:status           # deve dizer "Database schema is up to date"
pnpm --filter @expedition/infrastructure db:supabase-setup   # garante bucket/policies/Realtime
```

O `baseline` computa o `checksum` de cada `migration.sql` (sha256 do arquivo, o mesmo que o
Prisma usa) e insere a linha em `_prisma_migrations` — equivalente a
`prisma migrate resolve --applied <name>`, mas sem precisar do engine do Prisma. Só grava as
que faltam; rodar de novo é no-op.

> Estado do `drk` em 2026-08-26: baseline **já aplicado** (as 15 migrations estão registradas)
> e `supabase-setup` **já aplicado** (bucket `community`, 3 policies, Realtime em
> `post_likes`/`post_comments`). Os passos acima ficam como runbook para reprovisionar.

## 3. Camada do Supabase que vive fora do Prisma

`prisma/supabase-setup.sql` (idempotente) cuida de:

- **Storage**: bucket privado `community` (16 MB, só imagens) + policies de INSERT/SELECT/DELETE
  escopadas pelo primeiro segmento do path = `tenant_id` do JWT (§5.12 · CO-09).
- **Realtime**: adiciona `post_likes` e `post_comments` à publicação `supabase_realtime` (CO-04).

Não entra como migration do Prisma porque mexe no schema `storage` e em publicações, fora do
alcance do `prisma migrate`. Rode-o depois das migrations, em todo ambiente.

## Testes de integração/RLS

Exigem `TEST_DATABASE_URL` apontando para um **Postgres descartável** (`supabase start` local
ou Testcontainers) — a suíte é **destrutiva** (`resetSchema` derruba o schema). **Nunca** rode
contra um banco com dado real. Ver `vitest.setup.db.ts`.

```bash
TEST_DATABASE_URL=postgres://... pnpm test:rls
TEST_DATABASE_URL=postgres://... pnpm test:integration
```

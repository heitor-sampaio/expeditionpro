# Migrations

**Regra única:** o Prisma é a fonte da verdade do schema. Toda mudança de banco passa
por uma migration do Prisma versionada no repositório. O MCP do Supabase é **read-only
para schema** — serve para inspecionar (`list_tables`), auditar (`get_advisors`) e ler
logs, nunca para aplicar DDL no fluxo normal.

Por quê: os tipos do app nascem do `schema.prisma` (via `prisma generate`), e o CI
constrói o schema do zero num Postgres puro a partir dos arquivos de migration. Esses
dois artefatos são obrigatórios de qualquer forma; deixar o Prisma ser o dono evita ter
uma segunda fonte descrevendo o mesmo schema — que é o que gera drift.

## O loop

```
1. edita packages/infrastructure/prisma/schema.prisma
2. pnpm db:migrate --name <mudanca>        # prisma migrate dev: cria a migration e aplica no banco LOCAL de dev
3. se criou tabela, anexa RLS/policy/trigger no migration.sql gerado (SQL cru)
4. pnpm check:rls                          # falha se alguma tabela nova ficou sem RLS (SEC-01)
5. pnpm exec tsc -b && pnpm test:unit      # garante que tipos e domínio seguem verdes
6. commita schema.prisma + a nova pasta de migration
7. CI (ou você) roda `pnpm db:deploy` contra o Supabase       # prisma migrate deploy
8. pnpm exec ... get_advisors (MCP) só para conferir depois
```

## Local vs produção — nunca confundir

| Ambiente | Comando | Observação |
|---|---|---|
| Dev local / branch | `pnpm db:migrate` (`migrate dev`) | Usa **shadow database** (cria/dropa) para detectar drift. **Nunca** aponte para o Supabase de produção. Use Postgres local ou um branch do Supabase. |
| Produção (Supabase) | `pnpm db:deploy` (`migrate deploy`) | Só aplica migrations pendentes. Sem shadow. É o que o CI roda. |
| Conferir estado | `pnpm db:status` | Lista aplicadas e pendentes. |

`migrate dev` precisa da conexão direta (porta 5432, `DIRECT_URL`); `migrate deploy`
também. O runtime da aplicação usa o pooler (`DATABASE_URL`, §2.3).

## RLS, policies e triggers

O Prisma não modela RLS. Elas vivem como **SQL cru no próprio `migration.sql`** (veja a
init: `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, o trigger de família). Assim ficam
versionadas junto do schema e rodam no CI. Toda tabela nova precisa da sua RLS na mesma
migration — `check:rls` reprova o CI se faltar.

## Baseline (feito uma vez)

A migration inicial foi aplicada ao Supabase via MCP durante o bootstrap (não havia
senha do banco na sessão). Para o ledger do Prisma (`_prisma_migrations`) ficar
alinhado, a init foi carimbada como já aplicada, com o checksum correto (sha256 do
`migration.sql`). Portanto **está tudo alinhado**: `pnpm db:deploy` vê a init como
aplicada e só rodará migrations novas.

Se algum dia o `deploy` reclamar que a init foi "modificada após aplicada", é sinal de
que o `migration.sql` mudou de bytes (ex.: quebra de linha). O `.gitattributes` fixa LF
justamente para isso não acontecer; o conserto é `pnpm db:baseline`.

## O que o MCP faz (e não faz)

| Faz | Não faz |
|---|---|
| `list_tables`, `get_advisors`, `query_logs`, ler dados | Aplicar DDL no fluxo normal |
| Debug pontual, inspeção pós-deploy | Ser fonte da verdade do schema |

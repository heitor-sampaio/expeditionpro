# ExpeditionPRO

SaaS multi-tenant de gestão de expedições 4x4. **Sistema financeiro antes de ser um CRM:** histórico é imutável, saldo é derivado.

PRD completo em [`docs/prd.md`](docs/prd.md). Convenções e regras inegociáveis em [`CLAUDE.md`](CLAUDE.md).

## Stack

Monorepo pnpm · React (Vite) · Fastify · Supabase (Postgres/Auth/Storage/Realtime) · Prisma 7 · Railway · Capacitor
Testes: Vitest (unit/integração/RLS) · Postgres real, nunca mock.

## Estrutura

```
packages/
  domain/          regras puras · zero deps · Cents, LocalDate, cálculo
  application/     casos de uso · ports · erro de negócio como tipo
  infrastructure/  Prisma, tenant client, RLS, seed, testkit
apps/
  server/          Fastify: webhook, endpoints públicos, API (Railway)
  web/             React + Vite, empacotado com Capacitor
```

A dependência aponta sempre para dentro. `packages/domain` tem **zero dependências** no `package.json` — o `node_modules` estrito do pnpm impede fisicamente que ele importe Prisma ou React. É a fronteira de camadas imposta pelo resolvedor, não só por disciplina.

## Pré-requisitos

- Node 24+ (o `corepack` acompanha e ativa o pnpm automaticamente)
- Docker (ou Supabase CLI) para subir um Postgres nos testes de integração/RLS

## Setup

```bash
corepack enable
pnpm install
cp packages/infrastructure/.env.example packages/infrastructure/.env   # ajuste as URLs
pnpm db:generate                                                       # gera o Prisma Client
```

## Scripts

| Comando | O quê |
|---|---|
| `pnpm test` / `pnpm test:unit` | Testes de domínio puro (sem banco) |
| `pnpm test:integration` | Repositórios contra Postgres real |
| `pnpm test:rls` | Isolamento entre tenants (as duas vias) |
| `pnpm lint` | ESLint com as regras inegociáveis |
| `pnpm exec tsc -b` | Typecheck de todo o grafo |
| `pnpm check:rls` | Falha se alguma tabela foi criada sem RLS (SEC-01) |
| `pnpm check:markers` | Falha se houver marcador de pendência em caixa alta |
| `pnpm db:migrate` | `migrate dev` — cria/aplica migration no banco local |
| `pnpm db:deploy` | `migrate deploy` — aplica pendentes em produção (Supabase) |
| `pnpm db:seed` | Semeia o catálogo (Anexos A e B) |

Fluxo de migrations (Prisma é dono do schema; MCP é só leitura) em [`docs/migrations.md`](docs/migrations.md).

## Banco e testes

Os testes de integração e RLS exigem Postgres real (§10.3). Suba um e exporte `TEST_DATABASE_URL`:

```bash
docker run --rm -d --name expedition-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17
export TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/expedition_test?schema=public"
createdb -h localhost -U postgres expedition_test   # ou via psql
pnpm test:integration && pnpm test:rls
```

O testkit aplica a migration (com RLS e triggers) a cada arquivo de teste. Detalhes em [`docs/testing.md`](docs/testing.md).

## Estado — Fase 0

O roadmap (§7) começa na Fase 0: tenancy, RLS, Prisma extension, schema, seed, harness de testes e CI. Ver [`docs/architecture.md`](docs/architecture.md) para o mapa das camadas e da estratégia de isolamento, e [`docs/status.md`](docs/status.md) para o que já está de pé e o que falta.

> **Nota de toolchain:** o TypeScript está fixado na linha **6.0.x**. O TypeScript 7 (compilador nativo) já saiu, mas o `typescript-eslint` ainda não o suporta (issue upstream #10940). Como o lint faz valer as regras inegociáveis no CI, mantemos o toolchain coerente no 6.x e subimos para o 7 quando o `typescript-eslint` publicar suporte.

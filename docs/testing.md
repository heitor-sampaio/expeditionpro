# Testes

A pirâmide do §10.3 do PRD, com um projeto Vitest por camada:

| Projeto | Cobre | Precisa de banco? |
|---|---|---|
| `unit` | Domínio puro: preço, faixa etária, cashback, saldo, parsers | Não |
| `integration` | Repositórios contra Postgres real, constraints, triggers | Sim |
| `rls` | Isolamento entre tenants e entre audiências | Sim |

Convenção de nome de arquivo decide o projeto:

```
foo.test.ts              → unit
foo.integration.test.ts  → integration
foo.rls.test.ts          → rls
```

## Rodando

```bash
pnpm test:unit          # rápido, sem banco — o dia a dia do TDD
pnpm test:integration   # exige TEST_DATABASE_URL
pnpm test:rls           # exige TEST_DATABASE_URL
```

`pnpm test` (o default) roda só o projeto `unit`, para quem não tem Postgres na frente continuar no ciclo vermelho-verde sem atrito.

## Postgres para integração e RLS

Nunca se mocka o banco (§10.3): metade das regras vive em constraint, trigger e RLS, e mock passa verde enquanto o SQL real falha. Suba um Postgres descartável:

```bash
docker run --rm -d --name expedition-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=expedition_test \
  -p 5432:5432 postgres:17

export TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/expedition_test?schema=public"

pnpm test:integration
pnpm test:rls
```

O testkit (`packages/infrastructure/src/testkit/db.ts`) cuida do resto: a cada arquivo, dropa e recria o schema, reaplica a migration (com RLS, policies e triggers) e cria o role `app_user` sem `BYPASSRLS` que as sessões de RLS usam. Testes não dependem de estado deixado por outros.

## Por que as duas vias no teste de RLS

`isolation.rls.test.ts` prova o isolamento por **duas** vias independentes, como o §2.2 exige:

- **RLS** — via role `app_user` (sem bypass) com `request.jwt.claims` populado, exatamente como o Supabase faz. É a garantia do acesso direto pelo portal.
- **Prisma Client Extension** — via client base (superuser, que bypassa RLS), provando que a injeção de `tenant_id` protege mesmo quando a RLS não é avaliada — o cenário real do Prisma em produção.

## Nome do teste cita o requisito

`describe('IN-18: alocação em transação única', ...)`. Rastreia PRD → teste e deixa auditar o que ainda não foi coberto. Todo bug vira um teste que falha **antes** do fix.

## Seeds determinísticos

Nada de `new Date()` dentro de teste — data de nascimento e datas de grupo são fixtures explícitas. Teste que quebra em janeiro por causa de um aniversário é o pior tipo de instável.

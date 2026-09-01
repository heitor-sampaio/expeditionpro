# Arquitetura

## Camadas

```
domínio         regras puras · sem I/O · sem Prisma · sem React
aplicação       casos de uso · transação, repositório, evento · define ports
infraestrutura  Prisma, Supabase, Storage, e-mail, push · implementa ports
interface       React (apps/web), rotas HTTP e webhook (apps/server)
```

A dependência aponta sempre para dentro. O domínio não sabe que Prisma existe.

**Como a fronteira é imposta.** Não por convenção: cada camada é um pacote pnpm com suas próprias dependências. `packages/domain` declara zero dependências, e o `node_modules` estrito do pnpm (`hoist=false`) faz qualquer `import` de Prisma/React ali falhar na resolução. O ESLint reforça com `no-restricted-imports` por camada, mas a garantia real é o resolvedor.

**Teste da fronteira:** se testar uma função de domínio exigir subir Postgres, a fronteira foi violada. Hoje `packages/domain` testa só com Vitest, sem banco.

## O coração: funções puras

O dinheiro do negócio vive em funções puras, sem banco e sem data corrente escondida:

- `resolvePriceCategory(birthDate, groupStartDate, ageBands)` — faixa etária → categoria
- `calculateBookingTotal(participants, priceTable)` — total da inscrição
- `calculateCashback(paidAmount, rule)` — crédito
- `projectBalance(entries)` — saldo derivado
- `mapWpFlatPayload(rawBody)` — normaliza o webhook

Já implementadas as primitivas que elas usam: `Cents` (dinheiro branded em centavos, nunca float) e `LocalDate` (data civil sem fuso, para a idade não variar com o servidor). As funções acima entram nas suas fases, cada uma por TDD.

## Isolamento multi-tenant — duas camadas

O risco nº 1 do sistema é o Prisma furar o isolamento entre tenants. A defesa é dupla e ambas são testadas (`isolation.rls.test.ts`):

### 1. RLS no banco

Toda tabela de negócio tem `ENABLE ROW LEVEL SECURITY` com policy lendo o tenant do JWT:

```sql
tenant_id = app.current_tenant_id()
-- current_setting('request.jwt.claims')::jsonb -> 'app_metadata' ->> 'tenant_id'
```

Lê `app_metadata` (não editável pelo usuário), nunca `user_metadata`. Usa `current_setting` em vez de `auth.jwt()` para a suíte de RLS rodar num Postgres puro no CI, sem o schema `auth` do Supabase. É a garantia do acesso direto (portal via `supabase-js`).

### 2. Prisma Client Extension

O role do Prisma tem `BYPASSRLS` — a policy **não** é avaliada por essa via. Então `packages/infrastructure/src/prisma/tenantClient.ts` injeta `tenant_id` em toda operação: `where` nos reads/updates/deletes, `data` nos creates, e reescreve `findUnique` (que não aceita filtro não-único) para `findFirst` escopado. A cada requisição constrói-se um client ligado ao tenant do `RequestContext`.

`check:rls` (no CI) falha se qualquer tabela for criada numa migration sem RLS — SEC-01 vira mecânico, não vigilância.

## Convenção de nomes

Domínio segue o glossário do §3.1 do PRD: `itinerary`, `scheduleEvent`, `group`, `booking`, `bookingParticipant`, `customer`, `supplier`. Nunca traduzir de novo — dois vocabulários é bug de conversa e de código.

## Decisões de bootstrap

- **Monorepo pnpm** em vez de pacote único: o portal recalcula preço ao vivo (PC-16) com as mesmas funções do servidor, então o domínio precisa ser compartilhável sem duplicação.
- **Fastify** na borda: plugins maduros de rate-limit por chave, CORS restrito e helmet/CSP, que o sistema exige (SEC-14, IN-23/24, §11.7).
- **Prisma 7** com driver adapter (`@prisma/adapter-pg`) e o novo generator `prisma-client` (ESM). URLs de conexão em `prisma.config.ts`.
- **TypeScript 6.0.x** temporário: ver a nota de toolchain no README.

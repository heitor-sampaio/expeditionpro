---
name: nova-tabela
description: Checklist para criar ou alterar tabela no ExpeditionPRO — tenant_id, uniques compostos, RLS, policies por audiência e testes de isolamento. Use SEMPRE que for escrever migration, adicionar modelo ao schema Prisma, criar tabela, alterar policy ou mexer em índice. Tabela sem RLS é o modo como vazamento entre tenants acontece; esta skill é o que impede.
---

# Tabela nova no ExpeditionPRO

`A01 — Broken Access Control` é o risco número um deste sistema, e tabela nova sem RLS é exatamente como ele acontece. Este checklist é obrigatório.

## 1. Colunas

- [ ] `tenant_id UUID NOT NULL` em toda tabela de negócio
- [ ] Índice composto **liderado por `tenant_id`**
- [ ] **Todo unique é composto:** `UNIQUE (tenant_id, cpf)`, nunca `UNIQUE (cpf)`
- [ ] `id` em UUID, nunca sequencial — id sequencial permite enumerar clientes e inscrições
- [ ] Dinheiro em `BIGINT` centavos
- [ ] `deleted_at` se a tabela toca financeiro. Registro que teve dinheiro associado não se apaga
- [ ] `custom_fields jsonb` se for entidade que o tenant pode estender

## 2. RLS

```sql
ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;
```

Policy lendo o tenant do JWT:

```sql
USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
```

**`app_metadata`, nunca `user_metadata`.** O segundo é editável pelo próprio usuário autenticado — colocar `tenant_id` lá entrega escalação de privilégio de graça.

Policies separadas por audiência. A do cliente (`role: customer`) é muito mais restrita que a da equipe: cliente nunca lê `supplier_expenses`, `supplier_payments`, margem, nem dado de outra família.

## 3. Prisma

O role usado pelo Prisma tem `BYPASSRLS`. **A policy que você acabou de escrever não é avaliada nessa via.** Um `findMany()` sem `where: { tenantId }` retorna a base inteira.

- [ ] A tabela está coberta pela Prisma Client Extension que injeta `tenantId`
- [ ] Se for um caso especial fora da extension, justifique no PR

Defesa em duas camadas: extension para o acesso do servidor, RLS para o que passa por PostgREST, Realtime e Storage.

## 4. Testes — antes da migration

Ordem TDD vale aqui. Escreva e veja falhar:

- [ ] Tenant A não lê nenhuma linha de tenant B
- [ ] Cliente autenticado não lê a tabela, ou lê só o que é dele
- [ ] API key só alcança o que o escopo declara
- [ ] Constraints e triggers fazem o que prometem — o unique composto, a hierarquia de dois níveis da família, o cascade

Contra **Postgres real**, uma sessão por papel. Mock de Prisma não toca em nada disso.

## 5. Storage

Se a feature guarda arquivo:

- [ ] Bucket privado, path prefixado por `tenant_id`
- [ ] URL assinada com validade curta
- [ ] Policy de storage correspondente
- [ ] EXIF removido em upload de imagem

## 6. Migration

- [ ] Reversível
- [ ] Aplicada em ambiente local antes do PR
- [ ] Não passa no CI se criar tabela sem `ENABLE ROW LEVEL SECURITY` (SEC-01)

## 7. Exposição

- [ ] DTO explícito por audiência. Nunca serializar a entidade do banco na resposta
- [ ] Whitelist de campos, nunca blacklist
- [ ] CPF mascarado por padrão
- [ ] Campo marcado como sensível não aparece em listagem nem exportação

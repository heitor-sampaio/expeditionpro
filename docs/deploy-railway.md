# Deploy do servidor no Railway (SEC-16)

O Fastify roda no Railway, em **`us-east`** — a mesma região do Supabase (`us-east-1`).
Separar as duas peças recriaria a latência entre regiões que já apareceu no BellarisOS
(`prd.md:1369`). Railway é **subprocessador declarado** para a LGPD (`prd.md:1367`).

## O que o `railway.json` resolve

Três armadilhas que derrubariam o primeiro deploy, todas invisíveis até acontecer:

1. **O `build` da raiz não inclui o servidor.** `pnpm -r --filter "./packages/*" build`
   compila só as libs; o `start` executa `apps/server/dist/main.js`, que nunca seria
   gerado. Um build padrão de PaaS terminaria "com sucesso" e o processo morreria no
   start, sem arquivo.
2. **O client do Prisma é gitignored** (`packages/infrastructure/src/generated/`). Sem
   `db:generate` antes do build, a compilação da infraestrutura falha por tipo ausente.
3. **A ordem importa**: `db:generate` → libs → servidor. O servidor compila contra o
   `dist` das libs, não contra o `src`.

## Variáveis

| Variável | Por quê |
|---|---|
| `DATABASE_URL` | **Pelo pooler** (`aws-0-us-east-1.pooler.supabase.com`). O host direto `db.<ref>.supabase.co` é IPv6-only e o Railway não alcança |
| `SUPABASE_URL` | Autenticação. **Sem ela o servidor recusa subir** (SEC-01) — antes ele degradava para um stub que aceitava qualquer requisição como owner |
| `CORS_ORIGINS` | Domínios do front, separados por vírgula. Vazio nega tudo |
| `PAYMENT_TOKEN_KEY` | Cifra do token do gateway. `openssl rand -hex 32`. Ausente, a rota de integração recusa operar em vez de guardar em claro |
| `SUPABASE_SERVICE_ROLE_KEY` | Convite de equipe. Ausente, a rota responde 503 |
| `NODE_ENV=production` | Fecha o stub de autenticação de desenvolvimento |
| `PORT` | Injetada pelo Railway — não definir à mão |

`RESEND_API_KEY` e `RESEND_FROM` são opcionais: sem elas, as notificações ao cliente
ficam desligadas com aviso no log, em vez de quebrar.

## Verificação depois do deploy

1. `GET /health` responde 200.
2. **Tirar a `SUPABASE_URL` e conferir que o serviço falha ao subir.** É o teste do
   SEC-01 valendo em produção: falha aberta é a pior forma de falhar, e a única prova de
   que ela não existe é vê-la recusar.
3. Um `GET /v1/customers` sem `Authorization` responde 401, não 200.

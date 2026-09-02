# Deploy no Railway (SEC-16)

Dois serviços no projeto **ExpeditionPRO**, ambos a partir de `heitor-sampaio/expeditionpro@main`,
em **`us-east`** — a mesma região do Supabase (`us-east-1`). Separar as peças recriaria a
latência entre regiões que já apareceu no BellarisOS (`prd.md:1369`). Railway é
**subprocessador declarado** para a LGPD (`prd.md:1367`).

| Serviço | Domínio | O que é |
|---|---|---|
| `api` | `api.drakkarexpedicoes.com.br` (e `api-production-e30a.up.railway.app`) | Fastify |
| `web` | `app.drakkarexpedicoes.com.br` (e `web-production-859bb.up.railway.app`) | Front React, arquivos estáticos servidos por `sirv` |

O domínio `.up.railway.app` continua ativo e continua listado no `CORS_ORIGINS`: derrubá-lo
sem necessidade só criaria um jeito de o sistema parar sem ninguém entender por quê.

## Onde a configuração vive

**No serviço, não no repositório.** O Railway usa o builder **Railpack** e trata
`railway.json` / `railway.toml` como Config as Code **deprecado** — o arquivo existiu aqui e
nunca foi lido, o que é pior do que não existir. Os comandos abaixo estão registrados em cada
serviço; esta tabela é a fonte da verdade para reconstruí-los.

| | `api` | `web` |
|---|---|---|
| Build | `pnpm db:generate && pnpm build && pnpm --filter @expedition/server build` | `pnpm --filter @expedition/domain build && pnpm --filter @expedition/web build` |
| Start | `pnpm --filter @expedition/server start` | `pnpm --filter @expedition/web start` |
| Healthcheck | `/health` | `/` |

### As armadilhas que esses comandos evitam

1. **O `build` da raiz não inclui o servidor.** `pnpm -r --filter "./packages/*" build`
   compila só as libs; o `start` executa `apps/server/dist/main.js`, que nunca seria gerado.
   Um build padrão de PaaS terminaria "com sucesso" e o processo morreria no start.
2. **O client do Prisma é gitignored** (`packages/infrastructure/src/generated/`). Sem
   `db:generate` antes do build, a compilação da infraestrutura falha por tipo ausente.
3. **A ordem importa**: `db:generate` → libs → app. O app compila contra o `dist` das libs.
4. **O `web` não põe `NODE_ENV=production`.** Poria, se ninguém pensasse: mas isso faz o
   `pnpm install` pular as `devDependencies`, e o `vite` é uma delas — o build morreria
   sem vite. Por isso o `sirv-cli` está em `dependencies`, não em `devDependencies`: ele é
   dependência de execução do serviço publicado.

### `RAILPACK_INSTALL_CMD` — o build que quebrava antes de qualquer variável

Definida nos dois serviços:

```
npm install -g corepack@latest && corepack enable && pnpm install --frozen-lockfile
```

O corepack que vem no Node do builder não consegue carregar o pnpm 11: o `pnpm install`
morre com `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`, erro que não menciona versão nenhuma e
manda o leitor procurar no lugar errado. O CI não sofre disso porque instala o pnpm direto,
sem passar pelo corepack.

## Variáveis

### `api`

| Variável | Por quê |
|---|---|
| `DATABASE_URL` | **Pelo pooler** (`aws-0-us-east-1.pooler.supabase.com`). O host direto `db.<ref>.supabase.co` é IPv6-only e o Railway não alcança |
| `SUPABASE_URL` | Autenticação. **Sem ela o servidor recusa subir** (SEC-01) — antes ele degradava para um stub que aceitava qualquer requisição como owner |
| `CORS_ORIGINS` | Domínios do front, separados por vírgula. **Vazio nega tudo** — com o front em serviço separado, esquecê-la derruba o sistema inteiro para o navegador |
| `PAYMENT_TOKEN_KEY` | Cifra do token do gateway. `openssl rand -hex 32`. Ausente, a rota de integração recusa operar em vez de guardar em claro. **Precisa ser byte a byte a mesma do ambiente que cifrou o token guardado**, senão o access token do ASAAS fica indecifrável |
| `SUPABASE_SERVICE_ROLE_KEY` | Convite de equipe. Ausente, a rota responde 503. Ignora a RLS por completo: **só no servidor**, nunca no front |
| `NODE_ENV=production` | Fecha o stub de autenticação de desenvolvimento |
| `PORT` | Injetada pelo Railway — não definir à mão |

`RESEND_API_KEY` e `RESEND_FROM` são opcionais: sem elas, as notificações ao cliente ficam
desligadas com aviso no log, em vez de quebrar.

### `web`

Todas são lidas **no build**, não na execução: o Vite as grava no bundle. Mudar qualquer uma
exige novo deploy, não basta reiniciar.

| Variável | Por quê |
|---|---|
| `VITE_API_URL` | O host da `api`. **Trocar de domínio exige novo deploy do `web`, não basta reiniciar** — o Vite grava o valor no bundle.  Vazia, o front chamaria `/v1/...` no próprio domínio e receberia o `index.html` com **200** — o erro só apareceria no `res.json()`. Entra também no `connect-src` da CSP: sem ela lá, o navegador bloqueia toda chamada |
| `VITE_SUPABASE_URL` | Auth, Storage e Realtime |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave publicável (`sb_publishable_…`). Pública por construção — vai no bundle |
| `VITE_PUBLIC_API_URL` | **Opcional.** Só para o túnel de desenvolvimento (cloudflared, ngrok) no endereço do webhook do ASAAS. Em produção o padrão é `VITE_API_URL` |

## Verificação depois do deploy

1. `GET /health` na `api` responde 200.
2. A `web` carrega e autentica; a aba de rede mostra as chamadas indo para o host da `api`,
   e o console **sem** bloqueio de CSP.
3. **Tirar a `SUPABASE_URL` da `api` e conferir que o serviço falha ao subir.** É o teste do
   SEC-01 valendo em produção: falha aberta é a pior forma de falhar, e a única prova de que
   ela não existe é vê-la recusar.

## Autenticação: a lista de URLs do Supabase

O front pede o retorno do link mágico para a própria origem (`emailRedirectTo:
 window.location.origin`), mas o Supabase **só obedece se a URL estiver na lista de
permitidas**. Fora dela ele ignora o pedido em silêncio e joga na `Site URL` do projeto —
e o sintoma é cair num host que não serve páginas, com um 404 que não menciona autenticação
nenhuma.

Em **Authentication → URL Configuration**:

- **Site URL:** `https://app.drakkarexpedicoes.com.br`
- **Redirect URLs:** `https://app.drakkarexpedicoes.com.br/**`,
  `https://web-production-859bb.up.railway.app/**` e `http://localhost:5173/**` —
  o último mantém o desenvolvimento local funcionando.

Link já enviado não se aproveita: o destino é decidido na hora da geração.

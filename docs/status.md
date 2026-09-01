# Status — Fase 0

> **Onde estamos (2026-08-31).** Suíte em **1.155 testes unitários**; typecheck, lint, `check:markers`, `check:rls` (38 tabelas) e prettier limpos; os cinco pacotes buildam. Banco do drk **em dia** (`db:status` sem migration pendente).
>
> Última sessão (2026-08-31), em seis frentes: **chave PIX do fornecedor** (FO-07), com o tipo reconhecido pela própria chave em vez de escolhido em seletor; **gastos por categoria** — catálogo de categorias com renomear/excluir, o relatório que reconcilia com o fechamento por saída (FO-05/FO-06), excluir gasto (GR-18) e um buraco de acesso fechado nos fornecedores (SEC-01); **Configurações → Equipe** (CF-05), que tirou os dados do condutor de uma constante no código; **o cupom virou desconto do cliente**, não ferramenta de balcão (CP-05 revisto); **o desconto de balcão passou a falar em total**, em % ou em reais, com volta ao preço de tabela (GR-04 revisto); e **o painel da inscrição virou barra de abas**, com as pessoas da família à vista.
>
> Antes disso: cupons (CP-01..10), os **três documentos da saída** — roomlist em PDF (GR-15), seguro em XLSX no modelo da corretora (GR-16), comboio em PDF ou XLSX (GR-17) — e a aba **Empresa** (CF-01..03).
>
> **Decidido (2026-08-31):** os três nomes ficam como estão — **Usuários** (quem acessa o sistema), **Equipe** (quem vai na saída) e **Clientes**. Um cliente também virar usuário não quebra o recorte: a aba Usuários concede acesso, e o cliente ganha o dele pela ficha.
>
> **Aberto:** o fluxo em que o cliente se inscreve e paga sozinho — é ele que dá uso ao cupom, e hoje a inscrição pelo portal cai na fila de revisão sem pagamento. O formatador de dinheiro ainda tem cópias em `customers/` e `itineraries/`. As pendências do gateway ASAAS seguem valendo — ver a seção de 2026-08-29.

Critério de pronto da Fase 0 (§7): tenancy, auth, RLS, Prisma extension, schema, seed do catálogo, harness de testes e CI, com a suíte de RLS provando isolamento rodando no CI.

## De pé

- [x] Monorepo pnpm com fronteira de camadas imposta pelo `node_modules` estrito
- [x] Toolchain: TypeScript (6.0.x, ver nota no README), Vitest 4, ESLint 10 flat config, Prettier
- [x] Primitivas de domínio por TDD: `Cents` (dinheiro branded) e `LocalDate` (data civil sem fuso) — 13 testes verdes
- [x] Camada de aplicação: `RequestContext`, erros de negócio como tipo
- [x] Schema Prisma multi-tenant: `tenants`, `memberships`, `customers`, `vehicle_brands`, `vehicle_models`, `itineraries` — uniques compostos liderados por `tenant_id`
- [x] Migration inicial com RLS em toda tabela + trigger de família de dois níveis (CL-11)
- [x] Prisma Client Extension injetando `tenant_id` em toda operação
- [x] Testkit de banco (Postgres real) e testes de isolamento pelas duas vias (RLS + extension)
- [x] Seed do catálogo (Anexos A e B): tenant Drakkar, **26 marcas / 107 modelos**, 15 roteiros — aplicado no Supabase e verificado por teste de contrato (`catalog.test.ts`) contra o Anexo A
- [x] Servidor Fastify com helmet/CSP, CORS restrito e rate-limit; health check testado
- [x] Guardas de CI: `check:rls` (SEC-01) e `check:markers` (sem TODO)
- [x] CI (GitHub Actions) com Postgres real rodando unit + integração + RLS + auditoria

## Provado no Postgres real (Supabase `expedition-pro`, us-east-1)

- [x] Migration aplicada: 6 tabelas, todas com `rls_enabled: true`
- [x] **Isolamento entre tenants provado**: como role `authenticated` com claim do tenant A, só o cliente de A fica visível, 0 de B (transação revertida, sem deixar dado)
- [x] **Trigger CL-11 provado**: terceiro nível de família barrado no banco real
- [x] Advisor de segurança do Supabase **limpo** (`search_path` fixado nas funções; `rls_auto_enable` sem `EXECUTE` público)
- [x] SEC-16: projeto em `us-east-1`

## Pendências antes de fechar a Fase 0

- [x] **Ledger do Prisma alinhado**: a init foi carimbada em `_prisma_migrations` no Supabase com o checksum correto (sha256 do `migration.sql`). `pnpm db:deploy` futuro vê a init como aplicada e só roda migrations novas. Fluxo em [`docs/migrations.md`](migrations.md).
- [ ] Rodar a suíte `vitest` de integração/RLS num Postgres **local** (a suíte é destrutiva — nunca contra o Supabase). Sem Docker nesta máquina, **o CI é hoje o único lugar onde esses 62 testes rodam** — passaram a rodar de verdade a partir do primeiro push, em 2026-09-01.
- [x] Seed do catálogo aplicado no Supabase (`pnpm db:seed` via pooler)
- [ ] Provisionar Railway em `us-east` (SEC-16) — Supabase já está
- [x] Policies de RLS por audiência `role = customer` (mais restritas que as da equipe) — ver "Autenticação real"
- [x] `api_keys` e o modelo de integração (§3.9) — entregue na Fase 4 (hash SHA-256, escopos, verify + gestão IN-21)
- [x] **Auth do Supabase → `RequestContext` na borda** — verificação do JWT entregue e provada (issuance/magic-link é follow-up). Ver "Autenticação real".

## Fase 1 — em progresso

Vertical de cadastro de cliente (CL-01) descendo as camadas, por TDD:

- [x] **Domínio** (puro, verde): `Cpf` — normalização, dígito verificador (CL-01), máscara (CL-08); `Plate` — formatos antigo e Mercosul (CL-05)
- [x] **Aplicação** (verde): caso de uso `registerCustomer` + port `CustomerRepository`, testado com fake in-memory na fronteira
- [x] **Infraestrutura** (tipado, roda no CI): `prismaCustomerRepository` sobre o tenantClient + teste de integração (mapeamento de data, UNIQUE por tenant, isolamento)
- [x] DX: Vitest resolve `@expedition/*` do source — ciclo TDD sem rebuild entre pacotes
- [x] **Interface HTTP**: `POST /v1/customers` com Zod na borda, DTO com CPF mascarado (SEC-03/04), erro de negócio → status (422/409/400); §3.2 (e-mail e telefone obrigatórios no responsável) aplicado
- [x] **Tela** de cadastro seguindo o design system (tokens, duas famílias, estados idle/enviando/sucesso/erro), com alternadores de modo e densidade; lógica em hook, componente só renderiza
- [x] **Acompanhantes (CL-03)**: `registerCompanion` (dois níveis, limite default 4, e-mail/telefone opcionais no acompanhante) + `POST /v1/customers/:id/companions` — app + infra + rota, verde
- [x] **Busca da família (CL-04)**: `searchCustomers` retorna a família inteira ao bater em qualquer membro (nome case-insensitive ou CPF) + `GET /v1/customers?q=` — provado no Supabase via curl
- [x] **Listagem e ordenação de clientes (CL-04)** ✅ (2026-08-27) — sem busca, `GET /v1/customers` lista **todas as famílias** (`listResponsibles` no port/fake/dev/prisma) e aceita `sort=name|created`; a busca passou a casar também **telefone**. UI: chips de "Ordenar" na tela de Clientes (estado de interface → accent), `useCustomerSearch` com debounce só quando há texto
- [x] **Nome e telefone normalizados na borda (CL-01 · §3.2)** ✅ (2026-08-27) — domínio novo: `normalizePersonName` (capitalização com partículas `de/da/dos`, hífen e apóstrofo) e `parsePhone`/`formatPhone`/`isValidPhone` (**E.164** com DDI 55, fixo e celular). Aplicados em `registerCustomer`, `registerCompanion` e `updateCustomerContact`; `InvalidPhoneError` → **422 `invalid_phone`**. Guardado normalizado, exibido formatado
- [x] **Endereço fiscal por CEP (CL-02)**: value object `Cep` (domínio), endereço opcional no `registerCustomer` (CEP normalizado) → repo → DTO → tela com **autocomplete ViaCEP + fallback manual + cache**; provado no Supabase via curl
- [x] **Veículo (CL-05)** — completo:
  - [x] Tabela `vehicles` — migration aplicada no Supabase **pelo fluxo Prisma** (`migrate deploy`, baseline segurou), RLS habilitada, isolamento provado via MCP, no escopo da Prisma Extension
  - [x] Endpoints de catálogo (`GET /v1/vehicle-brands`, `.../:id/models`) + caso de uso `saveVehicle` (catálogo ou "Outro" + `needs_catalog_review` + placa validada) + `POST /v1/customers/:id/vehicles` — provado no Supabase via curl (26 marcas, cascata, veículo salvo, cascade no delete)
  - [x] Combobox filtrável (`ui/Combobox.tsx`) composto de campo + menu: abre sem digitar, filtra sem acento/caixa, "Outro" fixo no rodapé, cascata marca→modelo (modelo desabilitado sem marca), teclado (setas/Enter/Esc); `VehicleForm` no cartão de família
- [ ] CL-01b (indicadores de e-mail/telefone verificados) — **deferido**: depende do magic link (marca `email_verified_at`) e da ficha do cliente (CL-06)
- [x] **Autenticação real** (verificação do JWT do Supabase → `RequestContext`) — ver seção própria; o stub de dev só entra quando `SUPABASE_JWT_SECRET` não está configurado
- [x] **Tela de Clientes e famílias** (CL-03/CL-04): busca em pílula (debounced) → famílias em cartão (responsável + acompanhantes em cartão pequeno) → adicionar acompanhante inline; cinco estados (prompt, carregando/esqueleto, erro+retry, sem resultado+limpar, resultados); design system só por token, lógica em hooks
- [x] **Reorganização de vínculo (CL-10)** — backend: `moveToResponsible` (cobre "mover para outra família" e "vincular como acompanhante" — mesma mecânica) e `promoteToResponsible` (tornar responsável, levando acompanhantes da origem), com guardas de dois níveis; rotas `POST /:id/move` e `/:id/promote`; provado no Supabase
- [x] **Merge de duplicados (CL-07)** — backend: `mergeCustomers` reatribui veículos e acompanhantes do duplicado ao sobrevivente e o remove; rota `POST /v1/customers/merge`; provado no Supabase
- [x] **UI de CL-07/CL-10 na ficha** ✅ (2026-08-27) — menu **Vínculo** no cabeçalho da ficha, com três ações e um modal cada:
  - **Vincular a outra família** (move): busca de responsáveis (reusa `useCustomerSearch`), escolha em rádio, exclui o próprio e o responsável atual da lista
  - **Tornar responsável** (promote): checklist dos **irmãos** da família de origem a levar (reusa o padrão `enroll-list`/`check-row` do portal); sem irmãos, diz isso em vez de mostrar lista vazia
  - **Mesclar cadastro duplicado** (merge): busca em toda a base (responsáveis + acompanhantes), aviso de que o escolhido é removido e não dá para desfazer
  - Ação indisponível **fica visível e desabilitada com o motivo à vista** (responsável com acompanhantes não pode virar acompanhante; quem já é responsável não promove) — regra pura em `familyActions.ts` (**+12 testes no web**, CL-07/CL-10), erro do servidor traduzido para uma frase em `familyErrorFor`
  - **Backend**: `getCustomerFile` passou a devolver `family` (responsável acima + acompanhantes da família, **sempre sem o próprio cliente**, só id e nome — nada de CPF de terceiro no DTO). +2 testes de uso e +1 de rota. Sem tabela nova, sem migration
  - Hook `useFamilyActions` (move/promote/merge) sobre o `api()` autenticado; componente só renderiza. CSS novo só de composição (`.entity-actions`, `.link-actions`, `.menu-item-reason`, `.pick-scroll`), nada hard-coded
- [x] **Edição de cadastro pela equipe (CL-06)** ✅ (2026-08-27) — aba **Dados** na ficha (só back-office): cartão único com responsável e acompanhantes, **todos os campos editáveis** (nome, CPF, nascimento, e-mail, telefone) e um "Salvar" que envia **só quem mudou**. Mesmo desenho do "Meus dados" do portal, sem os bloqueios — a equipe é o caminho autoritário; pelo portal o cliente só pede (PC-07)
  - **Caso de uso `updateCustomer`** (TDD, 9 testes): normaliza nome e telefone (E.164) na entrada, valida CPF e a **unicidade por tenant excluindo o próprio**, exige e-mail+telefone no responsável (§3.2) e permite limpar no acompanhante, campo ausente preserva o valor. **Identidade (nome/CPF/nascimento) exige owner/admin** — mesmo peso da decisão da fila PC-07; contato qualquer papel de equipe; cliente → 403
  - **Auditoria** (§3.2.1): grava `customer.update` com **quais campos mudaram** (`{fields:[...]}`), nunca o valor — a trilha não vira segunda cópia do cadastro (SEC-04). Sem mudança nenhuma, não escreve nada
  - **Port `updateProfile`** (fake/dev/prisma): a ficha inteira numa escrita só, para a edição não deixar o cadastro meio salvo. Sem migration (colunas existentes)
  - **Leitura `getCustomerFamily`** (TDD, 4 testes) + `GET /v1/customers/:id/family` — família com os campos completos para o editor, **só equipe** (o portal tem a própria, com CPF mascarado). Entrar pelo acompanhante resolve a mesma família
  - **Endereço fiscal do responsável** na mesma aba (CL-02): `AddressFields` com CEP → ViaCEP no blur e preenchimento manual como fallback; entra no PATCH só se mudou. `address` passou a existir no DTO de cliente do web
  - **Aba no molde do portal + veículos** ✅: o cartão passou a repetir o desenho do "Meus dados" — membros, **"Adicionar acompanhante"** inline (reusa `CompanionForm`/CL-03), **veículos da família** e endereço, tudo no mesmo "Salvar"
  - **Remover acompanhante (CL-03)** — botão por acompanhante no cartão (nunca no responsável) com **modal de confirmação**. `removeCompanion` (TDD, 6 testes) **recusa quem tem histórico** (participação em inscrição ou lançamento de cashback → `has_history`) antes de o RESTRICT das FKs estourar; responsável → `not_a_companion` (para isso existem vínculo e merge); exige **owner/admin** (apagar cadastro é irreversível) e audita `customer.remove`. Rota `DELETE /v1/customers/:id` → 204 (+2 testes de rota). Veículo do removido cai por cascade, como o schema já previa
  - **Editar veículo (CL-05)** — o port só sabia **anexar**; ganhou `listVehiclesByCustomer`, `findVehicleById` e `updateVehicle` (fake/dev/prisma). Casos de uso `listCustomerVehicles` e `updateVehicle` (TDD, 6 testes) com **escopo de família** pelo dono do veículo; a resolução de marca/modelo virou `resolveCatalogSelection`, compartilhada com `saveVehicle` (mesma regra nos dois, sem duplicar). Rotas `GET /v1/customers/:id/vehicles` e `PATCH /v1/vehicles/:id` (+3 testes de rota, primeiro arquivo de teste de rota de veículo). Sem migration
  - **Bug corrigido no portal**: em Minha conta o campo **Nascimento** aparecia vazio — a ficha manda `dd/mm/aaaa` e o `input type=date` fala ISO (os acompanhantes vinham de `/v1/portal/family`, já em ISO, então só o responsável quebrava). Passou a usar o mesmo `brDateToIso`
  - **HTTP** `PATCH /v1/customers/:id` (+3 testes de rota: normalização no DTO, 422 de CPF inválido, 404). Front: `useCustomerFamily` (GET + PATCH por membro, códigos traduzidos), `FamilyEditor` e `brDateToIso` (helper puro, 3 testes — o DTO exibe `dd/mm/aaaa` e o `input type=date` fala ISO). Cinco estados na aba, **nenhuma classe CSS nova**
- [x] **`audit_logs` (§3.2.1 · A09 · SEC-01)** — trilha transversal de ações sensíveis, provada no Supabase:
  - [x] **Aplicação** (TDD, 3 testes citando §3.2.1/CL-10/CL-07): port `AuditLogRepository` (`record` append-only + `listByEntity`) + helper `actorUserId` (equipe/cliente têm usuário; integração/sistema nulos). As três operações do §3.2.1 passaram a gravar: `moveToResponsible` → `family.move` (`{from,to}`), `promoteToResponsible` → `family.promote` (`{from,to,brought}`), `mergeCustomers` → `customer.merge` (`{merged}`). Registro **dentro do caso de uso** (é garantia de negócio, não best-effort como e-mail)
  - [x] **Tabela** (checklist `nova-tabela`): `tenant_id` NOT NULL, id UUID, `actor_user_id` nullable, `entity`/`entity_id` (polimórfico, `entity_id` TEXT), `action`, `diff jsonb`, `created_at`; **append-only** (sem UPDATE/DELETE no fluxo; retenção de 2 anos é purga por data); índices `(tenant_id, entity, entity_id)` e `(tenant_id, created_at)`; FK cascade. No escopo da Prisma Extension
  - [x] **RLS**: só `tenant_isolation` com o guarda `role <> 'customer'` — **auditoria é dado de equipe, o cliente nunca lê** (nada de investigação exposta ao portal). Sem `customer_read`
  - [x] Provado no Supabase (migration `20260825150000_add_audit_logs`): dois tenants semeados → equipe A vê só a linha de A (`family.move`), equipe B só a de B (`customer.merge`), **cliente vê 0** (guarda de role); advisor de segurança sem alerta na tabela; dado de teste removido (0 resíduo). Aplicada via MCP — baseline do Prisma antes do próximo `migrate deploy`, como as anteriores
  - [x] **Chaves de API auditadas (§3.9 · IN-21)** (TDD, +2 testes): `createApiKey` → `api_key.create` (`{name,scopes,environment}`, **nunca o token nem o hash**) e `revokeApiKey` → `api_key.revoke`. `listApiKeys` ganhou deps próprias (não exige `audit`, é leitura)
  - [ ] Follow-up: SEC-04 (acesso a CPF completo registrado em audit_logs, quando existir o endpoint dedicado); alteração de escopo de chave (não há edição de escopo hoje, só criar/revogar)
- [ ] Fornecedores, roteiros (RO-02 preços versionados), configurações
- [ ] Refinamento: busca por nome sem acento (precisa da extensão `unaccent` no Postgres); hoje é só case-insensitive

### Relatórios — fechamento por saída (consolidado)

- [x] **Aplicação** (TDD, 4 testes): `getFinancialReport` — estende o GR-10 (`computeGroupResult`) para a carteira toda: uma linha por saída (receita = contratado das **confirmadas**, gastos com fornecedores, margem + %, recebido, a receber = receita − recebido), ordenada por data de início, com **totais do tenant** no rodapé. Guarda de audiência: **dado financeiro é só da equipe** (cliente → 403). Sem tabela nova (leitura pura, tudo derivado)
  - Corrigido de passagem: o fake de pagamentos ignorava o `groupId` no `listByGroup` (voltava tudo do tenant) — com 1 grupo passava, com 2 quebrava; agora filtra pelos bookings do grupo, como o repo real via join
- [x] **HTTP**: `GET /v1/reports/financial` (DTO com datas ISO). Provado ao vivo: saída com casal confirmado + recebimento parcial + gasto → receita 200000 / gastos 80000 / margem 120000 (60%) / recebido 150000 / a receber 50000
- [x] **UI** (design system "Relatórios"): tela **Relatórios** na nav — faixa de estatísticas (receita, gastos, margem verde/vermelho pelo sinal, a receber em accent) + tabela de saídas (nome+datas, receita, gastos, margem+%, a receber `--o`) com **rodapé de totais**. Cinco estados (esqueleto, erro+retry, vazio-convite); hook `useFinancialReport`. Web builda limpo
- [x] **Filtro do relatório (período + roteiro)** (+2 testes): `getFinancialReport(deps, ctx, filter?)` — janela por data de início da saída e/ou `itineraryId`. Rota `GET /v1/reports/financial?from=&to=&itineraryId=`. UI: barra de filtros (De/Até/roteiro via `useItineraries`) + estado "filtro sem resultado" distinto de vazio (oferece limpar). Provado ao vivo (janela 2028 → vazio; por roteiro → a saída certa)
- [x] **Dashboard operacional (Visão geral)** (+2 testes): `getDashboard` — **confirmado × projetado** (projetado = confirmado + pendente; somar pendente na receita infla o caixa, §3.6), a receber, **pendências** (fila de alocação + inscrições pendentes) e **próximas saídas** (início ≥ hoje, com confirmadas/pendentes/vagas). Só a equipe (403 p/ cliente). Rota `GET /v1/reports/dashboard`; tela "Visão geral" é a home da nav (faixa de estatísticas + tabela de próximas saídas clicável → mesa). Provado ao vivo

### Documentos / Termo de adesão (§5.13 · LGPD) — em progresso

- [x] **Domínio puro (DOC-03/DOC-04/DOC-07)** — `resolveAcceptanceRequirement` (quando um cliente precisa (re)aceitar a versão vigente: cliente novo aceita a vigente; quem aceitou anterior segue coberto **só se** a nova versão não exige reaceite; sem termo publicado não exige nada) e `renderTermTemplate` (substitui `{{marcador}}` pelos dados reais; marcador sem valor fica literal, nunca "undefined"). 9 testes, sem I/O
- [x] **Aplicação (DOC-01/02/03/04/05)** (TDD, 7 testes): port `LegalDocumentRepository` + fake + 4 casos de uso — `saveTermDraft` (owner/admin, cria doc sob demanda + upsert do rascunho), `publishTermVersion` (congela o rascunho vigente como imutável, grava `requires_reacceptance`/quem/quando), `getTermAcceptanceStatus` (usa o domínio; equipe consulta qualquer cliente, cliente só a si), `acceptTerm` (registra por cliente+versão com canal/IP/UA; único). Ciclo completo verde: rascunho→publica→cliente aceita→v2 c/ reaceite volta a bloquear
- [x] **Tabelas `legal_documents` + `legal_document_versions` + `document_acceptances`** (checklist `nova-tabela`) — provadas no Supabase:
  - [x] `tenant_id` NOT NULL em todas; uniques compostos (`(tenant_id, kind)` — um Termo por tenant; `(document_id, version_number)` — versão única; `(document_version_id, customer_id)` — aceite único por cliente+versão, DOC-04); rascunho = `published_at` nulo; `document_version_id` com **`ON DELETE RESTRICT`** (versão com aceite nunca é apagada, DOC-10); índices liderados por `tenant_id`. `prismaLegalDocumentRepository` + no escopo da Prisma Extension; migration `20260825160000_add_legal_documents`
  - [x] **RLS por audiência**: equipe total (tenant_isolation com guarda de role); **cliente lê só o Termo publicado (nunca rascunho) e os próprios aceites** (escopo `current_family_ids()`); escrita mediada pelo servidor
  - [x] Provado no Postgres real: cliente do drk vê 1 versão (a publicada, não o rascunho) + o próprio aceite; cliente de outro tenant vê 0/0/0; equipe drk vê as 2 versões + o aceite; advisor sem alerta nas 3 tabelas; dado removido (0 resíduo)
- [x] **Fiação HTTP** (+2 testes de rota DOC-01..05): `ServerDeps.documents` + rota `documents.ts` — `GET /v1/documents/term` (estado do editor: rascunho + vigente, novo caso `getTermEditorState`), `PUT /v1/documents/term/draft`, `POST /v1/documents/term/publish` (201), `GET /v1/customers/:id/term` (status de aceite), `POST /v1/customers/:id/term/accept` (canal derivado do ator, IP de `x-forwarded-for`/`request.ip`, UA do header). `inMemoryLegalDocuments` para dev; aceite duplicado → **400 `already_accepted`** (in-memory e Prisma via P2002→BusinessRuleError). Fluxo verde ponta a ponta: rascunho→publica→cliente aceita→coberto
- [x] **Sanitização HTML por allowlist (DOC-09)** (domínio, 7 testes): `renderMarkdownToSafeHtml` — **seguro por construção**: escapa todo HTML antes e só emite tags conhecidas (títulos, parágrafos, negrito, itálico, lista, link de esquema seguro). `<script>` do texto vira texto; link `javascript:` vira texto; marcadores `{{var}}` preservados. `saveTermDraft` passou a receber **Markdown** e renderizar o HTML aqui (contentJson guarda a fonte)
- [x] **UI Documentos (DOC-01/DOC-07)** — Configurações → Documentos: editor Markdown (`.field-textarea` do design system) + segmentado Editar/Pré-visualizar (HTML sanitizado do servidor via `dangerouslySetInnerHTML`) + publicar com switch "exige novo aceite" e resumo da mudança. Cinco estados (esqueleto, erro+retry, sem permissão para viewer via 403, vazio = editor com convite). Nav + rota no App; hook `useTermDocument`. Web compila e builda limpo; **fluxo provado ao vivo** (PUT draft→publish→status→accept: 200/201/200/201) numa instância limpa
- [ ] **Escolha do usuário:** editor Markdown leve agora; trocar por TipTap (WYSIWYG) depois se quiser
- [x] **Aceite no portal do cliente (DOC-04)** — gate no `PortalApp`: ao entrar, `useTermAcceptance` consulta `GET /v1/customers/:id/term`; se precisa aceitar, **bloqueia o portal** com o texto do Termo (scroll dentro do cartão), checkbox obrigatório "Li e aceito o Termo de Adesão" e "Aceitar e continuar" (canal `portal`, IP/UA no servidor); depois libera a ficha. Cinco estados (esqueleto, erro+retry, coberto=passa direto); o header com "Sair" permanece. +2 testes de unidade da guarda **cliente-só-por-si** (consulta/aceita a si → ok; por outro → 403). Web builda limpo
- [x] **Consentimento de marketing (DOC-06 · CM-04)** — vertical completa provada no Supabase:
  - [x] **Domínio/Aplicação** (7 testes): port `CommunicationConsentRepository` (ledger por canal) + `getCommunicationConsents` (estado {email,push}, desmarcado por padrão) + `setCommunicationConsent` (conceder idempotente / **opt-out de um clique**, histórico preservado). Guarda **cliente-só-por-si** (403); conceder após revogar cria nova linha ativa
  - [x] **Tabela `communication_consents`** (checklist `nova-tabela`): ledger (`granted_at`/`revoked_at`, nunca apagado — ônus da prova), **índice único parcial** `(tenant,cliente,canal) WHERE revoked_at IS NULL` (no máx. 1 ativo por canal), RLS por audiência. Migration `20260826120000`; provado no Postgres: índice parcial barrou 2º ativo, cliente vê só o próprio, outro tenant vê 0, advisor limpo; dado removido
  - [x] **HTTP** (+2 testes de rota): `GET /v1/customers/:id/consents`, `PUT /v1/customers/:id/consents/:channel`. Provado ao vivo: desmarcado→grant→opt-out→canal inválido 400
  - [x] **UI**: checkbox de marketing **separado e desmarcado** no gate de aceite do portal (liga e-mail só se marcado, DOC-06) + cartão **Comunicação** no portal com switches por canal (opt-out de um clique, CM-04). Web builda limpo
- [x] **Captura do aceite na inscrição pelo site (DOC-04 · §5.7.1)** (+3 testes): o mapeador `wp_flat_v1` já extrai `consent` (de `aceite="1"`); `allocateFromQueue` passou a **materializar o aceite** quando o cliente existe — grava contra a versão vigente no **canal `site`**, com `booking_id` e a **data do envio** (`submitted`), não a da alocação. No-op se não aceitou, se não há termo publicado, ou se já aceitou a vigente (idempotente — pode ter aceitado antes pelo portal). Provado ao vivo: webhook `aceite=1` → alocar → status do responsável vira `mustAccept:false`
- [x] **Contrato aceito reconstruído sob demanda (DOC-08)** — decisão do usuário: **sem PDF por cliente**. Provado ponta a ponta:
  - [x] **Domínio** (5 testes): `resolveTermVariables` (dados da inscrição → mapa formatado: CPF **cheio**, data BR `DD/MM/AAAA`, moeda) + **fix do renderizador markdown** (bug: o `_` de `{{cliente_nome}}` virava `<em>` e quebrava o marcador; agora os marcadores ficam atrás de sentinela na formatação inline, e negrito/itálico **ao redor** ainda funcionam — 2 testes de regressão)
  - [x] **Snapshot no aceite**: coluna `variables jsonb` em `document_acceptances` (uns 200 bytes por aceite, migration `20260826130000`); a alocação do site resolve e congela os valores. `renderAcceptedTerm` (3 testes) monta o contrato = texto congelado da versão + snapshot, via `renderTermTemplate`; guarda de posse (equipe qualquer, cliente só o próprio, via `customer_id` do aceite)
  - [x] **HTTP** `GET /v1/bookings/:bookingId/term-document`. Provado ao vivo: webhook `aceite=1` → alocar → contrato preenchido (`Eu, Ana Prado (CPF 153.509.460-56)... **Coxilha Rica** de 10/11/2025 a 14/11/2025 por R$ 2.000,00. Participantes: Ana Prado, João Prado`)
  - [x] **UI "ver termo aceito"** (componente `AcceptedTermView` + hook `useAcceptedTerm`, busca sob demanda): na **mesa do grupo** (RowPanel, back-office) como bloco expansível por inscrição; no **portal** o cliente clica a linha da expedição e o termo abre embaixo. HTML sanitizado do servidor via `dangerouslySetInnerHTML`; estados idle/carregando/none(sem aceite)/erro. Web builda limpo
  - [ ] Follow-up menor: `empresa_nome`/`empresa_cnpj` no snapshot (hoje vazios — precisa de uma leitura do tenant)

### Comunidade (§5.12 · CO-*) — backend provado no Postgres

- [x] **Domínio** (6 testes): `validatePostContent` (CO-01 — foto com legenda: 1 a 10 fotos obrigatórias, legenda ≤2000) + `validateComment` (CO-04 — ≤1000, não vazio). `PostValidationError` com código
- [x] **Aplicação** (8 testes): port `CommunityRepository` + `createPost` (CO-01/CO-07 — publica direto, só cliente é autor), `getCommunityFeed` (CO-03 — cronológico desc, filtro por roteiro, cursor, `likedByViewer` por leitor), `togglePostLike` (CO-04), `commentOnPost` (CO-04), `reportContent` (CO-08 — qualquer cliente denuncia), `moderatePost` (CO-08 — equipe oculta/remove/restaura com motivo; cliente → 403)
- [x] **Tabelas** (checklist `nova-tabela`): `posts`, `post_media`, `post_likes` (PK composta), `post_comments`, `post_reports` — migration `20260826140000_add_community`, `prismaCommunityRepository` (contagens derivadas, `likedByViewer`), no escopo da Extension
- [x] **RLS por audiência** — provada no Postgres real: **comunidade fechada e por tenant**; cliente lê só o feed **publicado** (posts/mídia/curtidas/comentários), **nunca denúncias** (só equipe); equipe vê tudo (incl. removidos) e modera; outro tenant vê 0/0/0/0. `post_media` (sem tenant_id) protegida por join ao post. Advisor sem alerta nas 5 tabelas; dado removido
- [x] **HTTP**: rotas `GET /v1/community/feed`, `POST /v1/community/posts`, `POST /:id/like`, `GET/POST /:id/comments`, `POST /v1/community/reports`, `POST /:id/moderate`. `inMemoryCommunity` para dev
- [x] **Pipeline de mídia (CO-09)** — bucket privado `community` no Supabase (16 MB, só imagens) + 3 policies de Storage (INSERT/SELECT/DELETE) escopadas pelo **primeiro segmento do path = `tenant_id`** do JWT (provadas ativas via `pg_policies`). Cliente: `uploadCommunityMedia` comprime **no navegador** (Canvas → WebP q80, 2560px no maior lado + thumbnail 480px) e sobe para `{tenant_id}/{uuid}.webp`; `signedUrl` exibe por URL assinada de validade curta. HEIC recusado com mensagem clara (decodificador é follow-up). *Código de navegador verificado por typecheck/build; execução no browser não roda neste ambiente*
- [x] **Comunidade — apagar próprio post, menu ⋯ e polimento do feed** ✅ (2026-08-26): o botão "Denunciar" virou **menu ⋯**; no post do próprio cliente vira **Apagar** (soft-delete via `deleteOwnPost`, CO-09 — só o autor; `mine` no DTO; **modal de confirmação** antes de apagar). Corrigido o **500 ao curtir**: o `findUnique` com chave composta virava `findFirst` no `tenantClient` (que não aceita a chave composta) — trocado por `findFirst`/`deleteMany` com campos separados. Feed no desktop em **duas colunas** (fotos à esquerda, texto à direita — `.community-page` largo + `.feed` `width:60%`, grid-areas mantendo o empilhado no mobile); foto **4:5** com container de proporção fixa (single/carrossel/mosaico padronizados em `cover`, sem "pular"); **ícones** em curtir (coração) e comentar (balão); **scroll infinito** (cursor `beforeId`); **comentários já visíveis** quando há algum (sem clicar); botão de **enviar dentro do input** (laranja, ícone branco, Enter envia); mais respiro entre autor e legenda. Typecheck/build/lint/markers limpos, **572 testes verdes**
- [x] **Admin curte e comenta como a marca** ✅ (2026-08-26): `togglePostLike`/`commentOnPost` aceitam a equipe. **Comentário** oficial = `author_customer_id` nulo (autor = nome do tenant). **Curtida** deixou de ter FK com customer: `post_likes.customer_id` → `liker_id` (id do cliente OU do usuário da equipe); `likedByViewer` usa o id de quem lê (cliente ou equipe). Helpers `communityAuthorCustomerId`/`communityActorId`. Migration `20260826210000` aplicada. No modo admin o feed reabilitou curtir/comentar. 572 testes verdes (+2: equipe comenta/curte).
- [x] **Comunidade unificada cliente + admin** ✅ (2026-08-26): a **mesma tela** (`ComunidadeScreen admin`) serve os dois — composer em modal, curtir/comentar, layout 2 colunas no desktop, scroll infinito. **Admin publica como a marca** (post oficial): `author_customer_id` nullable (null = oficial → autor = nome do tenant; migration `20260826200000`), `createPost` aceita equipe, `official` no record/DTO, selo "oficial" no post. **Moderação no modo admin**: menu ⋯ vira destacar/ocultar/remover, fila de denúncias no topo (`useModeration` sobre o feed comum); curtir vira leitura e comentários sem input. `AdminComunidadeScreen`/`useAdminCommunity` removidos. 570 testes verdes.
- [x] **Comunidade — input de fotos, preview e layout carrossel/mosaico** ✅ (2026-08-26): file input estilizado (botão "Escolher fotos", sem desalinhar), **preview** das fotos no composer (com remover), e **seletor carrossel/mosaico** quando há >1 foto. **Layout persistido** no post: coluna `layout` (`carousel`/`mosaic`, default mosaic; migration `20260826190000` aplicada), toda a cadeia (`normalizePostLayout` no domínio + createPost + repos + rota + DTO + `useCommunity`). Exibição via `PostMediaView` (single/mosaico/carrossel com setas e dots) no feed **e** na moderação. 568 testes verdes.
- [x] **Comunidade — composer em modal, editor, 3 fotos, hashtags** ✅ (2026-08-26): **nova publicação** virou modal (botão no header). **Máx 3 fotos** por post (`MAX_MEDIA` 10→3 no domínio, validado no servidor; composer faz slice). **Editor de legenda** (`MarkdownEditor`) com botões físicos — negrito, itálico, lista, hashtag — que aplicam markdown à seleção. **Exibição** via `RichText` (subset de markdown parseado para React, sem HTML cru) usada no feed do cliente **e** na moderação do admin; **#hashtags** destacadas (`extractHashtags` puro no domínio, 3 testes). **Consentimento de imagem** saiu do feed → aba **Privacidade** em Minha conta. 567 testes verdes; typecheck/build/lint/markers limpos. (Admin não posta — o composer/Privacidade são do cliente; a renderização vale para ambos.)
- [x] **UI do feed no portal** — aba **Comunidade** no portal (abas Minha conta / Comunidade): composer (escolher fotos → comprime+sobe → publica com legenda ≤2000), cartões de post (autor, mídia em grade por URL assinada, legenda, curtir com contagem, comentários expansíveis com envio, denunciar). Cinco estados; hooks `useCommunity`/`uploadMedia`. Web builda limpo
- [x] **Moderação + fila de denúncias no back-office (CO-08 completo)** — tela **Comunidade** na nav do admin:
  - [x] **Fila de denúncias** (2 testes): `getModerationQueue` (lista `post_reports` abertas, enriquecidas com denunciante + post/autor/status) + `resolveReport` (resolved/dismissed, grava quem/quando) — só equipe (cliente → 403). Rotas `GET /v1/community/reports` e `POST /:id/resolve`. UI no topo: cada denúncia mostra quem denunciou, o motivo e o post, com **Remover post** (remove + resolve) ou **Descartar**
  - [x] **Feed com moderação**: a equipe vê o feed e oculta/remove cada post com motivo obrigatório. Hooks `useAdminCommunity` + `MediaThumb` compartilhado. Provado ao vivo (fila 200, equipe não posta → 403, resolver 200)
- [x] **Consentimento de imagem (CO-10)** (3 testes) — tabela `media_consents` (ledger por escopo `community|marketing`, índice único parcial do ativo, RLS por audiência; migration `20260826150000`, provada aplicada). Casos `getMediaConsents`/`setMediaConsent` reusam a guarda cliente-só-por-si. Rotas `GET/PUT /v1/customers/:id/media-consents(/:scope)`. UI: **switch "uso da minha imagem na comunidade"** no topo do feed do portal (revogável). Provado ao vivo (liga→revoga)
- [x] **Curadoria/destaque (CO-11)** (1 teste) — coluna `posts.featured_at` + `setPostHighlight` (equipe) + filtro `featuredOnly` no feed (`GET /v1/community/feed?featured=true`, para a página do roteiro). UI: botão **Destacar / Remover destaque** + pill "destaque" no cartão do admin. Provado ao vivo
- [x] **Realtime (CO-04)** — publicação `supabase_realtime` habilitada em `post_likes` + `post_comments`; o feed do portal assina via `supabase.channel` e recarrega (coalescido em 500ms) quando alguém curte/comenta. *Browser não roda aqui; publicação e código verificados*
- [x] **Conversor HEIC** — `heic2any` (importado sob demanda) converte HEIC/HEIF → JPEG antes da compressão no `uploadMedia`. *Verificado por typecheck/build*

Suíte: **462 testes unitários verdes**; integração/RLS type-válidos, rodando no CI contra Postgres. Vertical CL-01 provada ponta a ponta em dev (form → API → 201 com CPF mascarado; 422/409 nos erros).

## Fase 2 — em progresso (agenda + grupos + inscrição manual)

- [x] **Núcleo de preço (§3.4)** — funções puras, **100% de cobertura**: `resolvePriceCategory` (faixa etária na data de início), `calculateBookingTotal` (casal/solo + adicionais), `priceParticipants` (snapshot), `priceBooking` (compõe idade→categoria→unitário→total da inscrição inteira, preservando ref/ordem, invariante soma==total), `resolveApplicablePrice` (versão de preço vigente por `valid_from`). + `compareLocalDate`.
- [x] **Snapshot por participante** — `priceParticipants` (categoria + valor unitário congelado; soma bate com o total, invariante testado), 100% cobertura
- [x] **Tabelas da saída** (via fluxo Prisma, RLS, deploy): `itinerary_prices` (versionado por `valid_from`, BigInt centavos), `schedule_events`, `groups`, `bookings`, `booking_participants` — **13 tabelas no Supabase, todas com RLS**, no escopo da Prisma Extension
- [x] `itinerary_photos` (Storage) — galeria de fotos do roteiro (RO-01): tabela + RLS por audiência (equipe total; cliente lê fotos de roteiros **ativos**) aplicada no Supabase (**34 tabelas com RLS**); bucket privado `itineraries` (path por tenant, 3 policies de Storage) no `supabase-setup.sql` e aplicado; teste de isolamento `itineraryPhotos.rls.test.ts`
- [x] **Roteiros (RO-01..03)** — backend completo, provado no Supabase via curl:
  - [x] **Aplicação** (verde): `createItinerary` (slug, kind catalog/custom, faixas com validação `young < mid`, preço inicial atômico), `addItineraryPriceVersion` (nova versão por `valid_from`), `resolveItineraryPrices` (tabela vigente numa data) + port `ItineraryRepository`
  - [x] **Infraestrutura**: `prismaItineraryRepository` — `create` atômico (`$transaction`: roteiro + preço inicial) com `tenant_id` explícito, conversão BigInt↔Cents nas bordas
  - [x] **Interface HTTP**: `POST /v1/itineraries`, `GET /v1/itineraries`, `POST /:id/prices`, `GET /:id/prices?at=DATE` (404 `no_price_for_date`); faixa inconsistente → 400 `invalid_age_bands`
  - [x] Provado no Supabase: criação atômica + versionamento + resolução por data (100000 antes de jun/2025, 200000 depois — conversão BigInt correta); dado de teste removido
- [x] **Roteiros RO-01 (editar + descrição + fotos)** — `updateItinerary` (nome/slug, descrição, dificuldade, situação, faixas; `PATCH /v1/itineraries/:id`) e `setItineraryPhotos` (substitui o conjunto; ≤10, capa única — 1ª vira capa se nenhuma marcada; `GET`/`PUT /:id/photos`). Editor markdown movido para `ui/MarkdownEditor` (reuso comunidade+roteiro); pipeline de imagem extraído para `ui/uploadImages` (bucket parametrizado). UI: botão "Novo roteiro" na linha do título, "Editar" por linha, modal com todos os campos + `MarkdownEditor` + `PhotoGallery` (upload/capa/remover)
- [x] **Roteiros em cards + página do roteiro** — índice virou grade de **cards 4 colunas** com a capa (novo `coverPath` no DTO de listagem, via join `is_cover`); clicar no card abre `ItineraryScreen` (navegação por estado no `Shell`, breadcrumb Roteiros/Roteiro), onde vive **toda a edição** (metadados, descrição, situação, fotos, reajuste de preço) e, no fim, o **histórico de realizações** (reusa `GET /v1/schedule-events` filtrado por `itineraryId`); clicar numa realização abre o `GroupBoardScreen`. Form compartilhado extraído para `itineraries/itineraryForm`
- [x] **Preço inline + histórico de reajustes (RO-03)** — os 5 campos de preço + "vigente a partir de" ficam na própria página do roteiro (sem modal); alterar um valor cria uma nova versão naquela data no mesmo "Salvar alterações" (detecção de mudança vs. versão vigente; exige a data). Novo caso de uso `listItineraryPriceVersions` + `GET /v1/itineraries/:id/price-versions`; seção "Histórico de reajustes" lista cada versão por `valid_from` (mais recente = "atual") com os cinco valores
- [x] **Agenda (AG-02/AG-03)** — backend da costura evento→grupo, provado no Supabase:
  - [x] **Aplicação** (TDD, 5 testes): `createScheduleEvent` valida roteiro no tenant (`NotFoundError`) e ordem das datas (`invalid_date_range`), cria evento + grupo atomicamente; grupo herda `pricing_mode` itinerary / `visibility` public / sem limite de vagas (AG-08/AG-07 mudam por comando); nome do grupo derivado do roteiro + data
  - [x] **Infraestrutura**: `prismaScheduleRepository.createEventWithGroup` num `$transaction` (evento + grupo, AG-03) com `tenant_id` explícito; `LocalDate`↔`Date` UTC nas bordas (colunas `@db.Date`)
  - [x] **Interface HTTP** (+3 testes de rota): `POST /v1/schedule-events` (201 com grupo aninhado), `GET /v1/schedule-events`; término antes do início → 400 `invalid_date_range`
  - [x] Provado no Supabase: evento gerou grupo vinculado (`schedule_event_id`), datas sem escorregão de fuso, `capacity_vehicles=10`; exclusão do evento **cascateou** o grupo (AG-04 parcial) — dado de teste removido
- [x] **Agenda AG-04/AG-05** — editar e excluir evento, provado no Supabase:
  - [x] **Aplicação** (TDD, +7 testes): `updateScheduleEvent` (edita datas/título/notas, **propaga o nome derivado ao grupo** — nome automático acompanha a data; snapshot das inscrições NÃO reprecifica), `deleteScheduleEvent` (**bloqueia com inscrições** → `group_has_bookings`, senão exclui e o grupo cai por cascade). `deriveGroupName` extraído e compartilhado com o create
  - [x] **Infraestrutura**: `updateEvent` num `$transaction` (evento + nome do grupo), `deleteEvent`; ambos com `tenant_id` explícito no `where`
  - [x] **Interface HTTP** (+3 testes de rota): `PATCH /v1/schedule-events/:id` (200), `DELETE /v1/schedule-events/:id` (204; 400 `group_has_bookings` com inscrição)
  - [x] Provado no Supabase: PATCH mudou a data e o nome do grupo virou `· 01/12/2025`; DELETE com inscrição bloqueado (400); sem inscrição, DELETE cascateou evento+grupo (204); dado de teste removido
- [x] **Agenda AG-01/AG-06** ✅ (2026-08-26) — ver "UI — front" abaixo: três visões (mês/semana/lista) + filtro por roteiro e status + ocupação no calendário
- [x] **Alocação da inscrição com snapshot (GR-01/GR-03 · IN-07/IN-18, caminho manual)** — provado no Supabase ponta a ponta:
  - [x] **Domínio**: `priceBooking` (acima) — a operação de snapshot no core 100% coberto
  - [x] **Aplicação** (TDD, 7 testes): `allocateBooking` valida grupo (`NotFoundError`), participantes (`NotFoundError` se algum fora do tenant/inexistente), inscrição não-vazia, duplicidade do responsável no grupo (IN-02 → `already_allocated`); resolve a tabela vigente na **data de início do grupo**, congela categoria + unitário por participante (`priceSource: auto`), cria a inscrição `pending` (IN-07); responsável precifica primeiro (ancora a base COUPLE/SOLO) + port `BookingRepository`
  - [x] **Infraestrutura**: `prismaBookingRepository.create` num `$transaction` (inscrição + participantes, IN-18) com `tenant_id` explícito; unitário `Cents`↔BigInt; total **não** é coluna — derivado da soma
  - [x] **Interface HTTP** (+2 testes de rota): `POST /v1/groups/:groupId/bookings` (201 com snapshot + total derivado); segunda inscrição do responsável → 400 `already_allocated`
  - [x] Provado no Supabase: cadeia roteiro→evento/grupo→clientes→alocação; `SUM(unit_price_cents)=240000` bate com o total calculado; snapshot congelado (COUPLE 200000 / COUPLE 0 / CHILD_YOUNG 40000, todos `auto`); dado de teste removido
- [x] **Override manual de valor (GR-04)** — provado no Supabase, motivo obrigatório:
  - [x] **Aplicação** (TDD, 8 testes): `overrideBookingPrices` — motivo obrigatório (`RequiredFieldError`), lista não-vazia, valor inteiro não negativo, participante precisa ser da inscrição (`NotFoundError`), inscrição cancelada não reprecifica (`booking_cancelled`); uma entrada = por participante, todas = por inscrição; total re-derivado da soma
  - [x] **Infraestrutura**: `applyParticipantOverrides` num `$transaction` (updateMany por `(tenant_id, booking_id, customer_id)`) — troca valor/origem/nota, **preserva a categoria** original do snapshot
  - [x] **Interface HTTP** (+2 testes de rota): `POST /v1/bookings/:bookingId/price-overrides`; motivo vazio → 400 na borda (Zod)
  - [x] Provado no Supabase: override de 2 linhas → `price_source: override` + `price_note` gravado, `SUM = 100000` re-derivado, `price_category` (SOLO/CHILD_YOUNG) intacta; dado de teste removido
- [x] **Leitura do grupo — Tabela 1 (GR-07/GR-13/GR-12)** — provado no Supabase:
  - [x] **Domínio** `summarizeGroupBoard` (puro, 6 testes): totais derivados das inscrições; separa **confirmado** de **projetado** (confirmado + pendente); cancelada/recusada não somam; a receber = contratado − recebido por bucket e por linha; só confirmada ocupa vaga (GR-12)
  - [x] **Aplicação** `getGroupBoard` (TDD, 6 testes): cabeçalho do grupo + uma linha por inscrição (contratado derivado da soma dos unitários, **recebido** derivado da soma dos recebimentos) + rodapé confirmado/projetado + ocupação (ocupadas = confirmadas, vagas = capacidade − ocupadas; nulo = sem limite); `listByGroup` nos ports de inscrição e de recebimento
  - [x] **Interface HTTP** (+2 testes de rota): `GET /v1/groups/:groupId/board` (404 se grupo não existe)
  - [x] Provado no Supabase: casal confirmado + solo pendente → confirmado 200000 / projetado 320000, pendente não ocupa vaga (1 ocupada / 4 livres de 5); dado de teste removido
- [x] **GR-02/GR-03 alocar família na mesa (UI)** — `AllocatePanel` no board: botão "Alocar família" → busca (nome/CPF, reusa `useCustomerSearch`) → escolhe a família → **checkboxes por membro** (todos marcados por padrão; "nem todos vão em toda saída") → `POST /v1/groups/:id/bookings` com o responsável + os marcados; refresh do board. Erros mapeados (IN-02 `already_allocated`, `no_price_for_group_date`). Backend já provado
- [ ] Grupo pendências: nome/veículo por linha (enriquecer o board com dados do cliente)
- [ ] Grupo `pricing_mode: manual` (valor livre por inscrição, AG-08) — caminho separado; hoje `allocateBooking` recusa com `manual_pricing_unsupported`

## Fase 3 — em progresso (financeiro)

- [x] **Tabela `booking_payments`** (§3.6, `nova-tabela`): `tenant_id` NOT NULL, id UUID, `amount_cents` BIGINT, `paid_at` DATE, `method` (pix/boleto/card/cash), `deleted_at` (toca dinheiro), índice `(tenant_id, booking_id)`, FK cascade; migration `20260824150000_add_booking_payments` aplicada no Supabase **pelo fluxo Prisma**, RLS habilitada, no escopo da Prisma Extension — **14 tabelas no Supabase, todas com RLS**
- [x] **IN-08/IN-09/GR-05 — recebimentos** — provado no Supabase ponta a ponta:
  - [x] **Aplicação** (TDD, 8 testes): `registerPayment` — **só owner/admin** lança (IN-09, senão `ForbiddenError`), valor positivo, inscrição existente e ativa (cancelada/recusada → `booking_not_active`); o **primeiro** recebimento (inscrição `pending`) a confirma na mesma transação gravando `confirmed_by`/`confirmed_at` (IN-08, integral ou parcial); `clock` injetado (data corrente é borda)
  - [x] **Infraestrutura**: `prismaPaymentRepository.create` num `$transaction` (recebimento + confirmação condicional, só se ainda `pending` — guarda de corrida); `Cents`↔BigInt; `paid_at` `@db.Date`. Board agora soma o **recebido** real (`listByGroup`)
  - [x] **Interface HTTP** (+2 testes de rota): `POST /v1/bookings/:bookingId/payments` (201, `confirmedNow`), método validado na borda (Zod); operator → 403
  - [x] Provado no Supabase: recebimento parcial 80000 confirmou a inscrição (`confirmedNow`, `confirmed_by`/`confirmed_at` gravados), board passou a confirmado 200000 / recebido 80000 / a receber 120000 / 1 vaga ocupada; **isolamento RLS provado** (tenant errado vê 0, certo vê 1); dado de teste removido
- [x] **Ciclo de vida da inscrição (IN-10/IN-11/IN-15/IN-16)** — provado no Supabase (13 testes de domínio + 2 de rota):
  - [x] `confirmBookingManually` (IN-10): confirma `pending` sem pagamento, **motivo obrigatório** → `confirmed_note`; só owner/admin (IN-09); já confirmada → `not_pending`
  - [x] `cancelBooking` (IN-15/IN-16): **só a equipe** cancela (cliente → 403), motivo obrigatório → `cancelled_reason`/`by`/`at`; **não apaga recebimentos** (ficam no ledger); já cancelada → `already_cancelled`
  - [x] `deletePayment` (IN-11): **soft delete** (`deleted_at`, dinheiro não some); excluir o único pagamento **não reverte** o status — retorna `requiresDecision` para o alerta; só owner/admin
  - [x] Rotas: `POST /v1/bookings/:id/confirm`, `POST /v1/bookings/:id/cancel`, `DELETE /v1/payments/:id`
  - [x] Provado no Supabase: confirm→pay→delete (status segue `confirmed`, `requiresDecision`)→cancel; no banco `confirmed_note`+`cancelled_reason`/`by`/`at` gravados, recebimento permanece no ledger com `deleted_at`; dado de teste removido
- [x] **Fornecedores + margem (FO-01 · GR-08/09/10)** — provado no Supabase, isolamento RLS provado:
  - [x] **Tabelas** (checklist `nova-tabela`): `suppliers` (unique `(tenant_id, doc)`), `supplier_expenses` (`total_cents` BigInt), `supplier_payments` (`deleted_at`, toca dinheiro) — migration `20260824160000_add_suppliers`, RLS nas 3, no escopo da Extension → **17 tabelas no Supabase, todas com RLS**
  - [x] **Domínio** `computeGroupResult` (puro, 5 testes): margem bruta = receita − gastos, percentual sobre a receita (1 casa, nulo se receita 0, margem pode ser negativa)
  - [x] **Aplicação** (TDD, 11 testes): `createSupplier` (FO-01/GR-08, nome obrigatório, doc normalizado a dígitos, único → `duplicate_supplier`), `addSupplierExpense` (GR-08, valida grupo+fornecedor, valor positivo), `registerSupplierPayment` (GR-09, só a equipe — PC-05), `getGroupResult` (GR-10: receita = contratado confirmado, gastos, margem + caixa recebido/pago/a pagar)
  - [x] **Interface HTTP** (+2 testes de rota): `POST /v1/suppliers`, `GET /v1/suppliers`, `POST /v1/groups/:id/expenses`, `POST /v1/expenses/:id/payments`, `GET /v1/groups/:id/result`
  - [x] **`listGroupExpenses` (GR-08/GR-09)** — leitura das despesas do grupo para a UI: cada despesa com nome do fornecedor, contratado, **pago (SOMA)** e **em aberto** derivados. TDD (2 testes), rota `GET /v1/groups/:id/expenses`. Provado no Supabase: despesa 300000 com pagamento 100000 → pago 100000 / em aberto 200000; dado removido
  - [x] Provado no Supabase: receita 200000 − gastos 120000 = **margem 80000 (40%)**, caixa recebido 100000 / pago 70000 / a pagar 50000; RLS: tenant errado vê 0, certo vê 1; dado de teste removido
- [x] **NF — check com quem/quando (GR-06)** — provado no Supabase:
  - [x] **Aplicação** (TDD, 5 testes): `markBookingInvoice` — marca/desmarca gravando `invoice_checked_by`/`_at` (clock injetado); número e data de emissão opcionais; desmarcar limpa os metadados; só a equipe (cliente → 403). `invoiceChecked` agora é campo do `BookingRecord` e coluna do board (Tabela 1)
  - [x] **Interface HTTP** (+1 teste de rota): `POST /v1/bookings/:id/invoice`
  - [x] Provado no Supabase: NF marcada com `NF-4242`/`2026-05-02`, `invoice_checked_by`/`_at` gravados, board expõe `invoiceChecked: true`; dado de teste removido
- [x] **FO-03 ficha do fornecedor** — `getSupplierFile` (TDD, 4 testes de uso + 2 de rota) agrega **saídas** em que prestou serviço (contratado/pago/em aberto por grupo, `paid` = SOMA), **extrato de pagamentos** e **dados fiscais**; totais derivados. Ports novos `listExpensesBySupplier`/`listPaymentsBySupplier` (fake/dev/prisma — filtro por `supplier_id`/relação `expense`). Rota `GET /v1/suppliers/:id/file`; **CPF do fornecedor mascarado no DTO** (SEC-04, CNPJ público) — máscara aplicada também no índice `GET /v1/suppliers`. Provado no Supabase: 2 despesas na mesma saída → contratado 280000 / pago 60000 / em aberto 220000; dado removido. Sem tabela nova
- [ ] Validação de dígito de CPF/CNPJ do fornecedor (hoje só normaliza a dígitos)
- [x] GR-11 reflexo no histórico do cliente/fornecedor — a saída aparece na ficha do cliente (aba Expedições, CL-06) e na do fornecedor (aba Saídas, FO-03), com o financeiro derivado

## Fase 4 — em progresso (webhook + fila de alocação)

- [x] **Tabelas `intake_events` + `api_keys`** (checklist `nova-tabela`): `api_keys` (hash SHA-256 do token, `scopes text[]`, unique por hash), `intake_events` (payload cru + normalized jsonb, unique `(tenant_id, source, external_id)`, status `received→needs_allocation→allocated|discarded|error`); migration `20260824170000`, RLS nas 2, no escopo da Extension → **19 tabelas no Supabase, todas com RLS**
- [x] **`mapWpFlatPayload` — perfil wp_flat_v1 (§5.7.1)**, função **coração** pura (TDD, 13 testes): lê `value` nunca `formatted`, aceita array `[0].body`; obrigatório bloqueia (`IntakeValidationError` com o campo → 422: CPF dígito verificador, e-mail frouxo, telefone 10–11 dígitos, data ISO); varre `acomp_{n}_*` (bloco incompleto → 422); malformado em opcional (placa) não bloqueia, grava como veio + aviso; desconhecido → `custom_fields` + aviso; normaliza CPF/telefone/CEP a dígitos, UF de 2 letras
- [x] **Receptor (IN-01/IN-02/IN-22)** — provado no Supabase:
  - [x] **Aplicação** (TDD, 7 testes): `receiveIntake` — confere API key (hash+slug+escopo+validade, senão 401), mapeia (422 no campo), deduplica por `{form_id}:{entry_id}` (200 duplicate), grava cru+normalizado como `needs_allocation` (202 queued); `isTest` do prefixo `_test_`; ports `ApiKeyRepository`/`IntakeRepository`
  - [x] **Infraestrutura**: `prismaApiKeyRepository.verify` (SHA-256, join com tenant por slug, **fora da extension** — é ela que resolve o tenant) + `touch` (last_used_at/use_count); `prismaIntakeRepository` (store/dedup/listQueue)
  - [x] **Interface HTTP** (+5 testes de rota): `POST /v1/intake/:tenantSlug` (header `api_token`) → 202/200/401/422 (`validation_failed` com `fields`); `GET /v1/intake` (fila). Erros novos: `UnauthorizedError`→401, `IntakeValidationError`→422
  - [x] Provado no Supabase: 401 sem token, 202 queued, 200 duplicate, 422 com campo; no banco corpo cru preservado + normalizado (CPF só dígitos, UF `SC` do value, acompanhante), `use_count`; **isolamento RLS provado** (intake e api_key: tenant errado vê 0, certo vê 1); dado removido
- [x] **Alocar da fila (IN-18/§5.7.2) + descartar (IN-19)** — provado no Supabase:
  - [x] **Aplicação** (TDD, 7 testes): `allocateFromQueue` — só a equipe, intake precisa estar `needs_allocation`; **cria ou reaproveita o cliente por CPF** (IN-03, sem sobrescrever) + acompanhantes vinculados, delega ao núcleo `allocateBooking` (booking `pending` + snapshot congelado pela data do grupo), marca o intake `allocated` (grupo/booking/quem/quando). `discardIntake` — motivo obrigatório, tira da fila
  - [x] **Infraestrutura**: `findForAllocation` (desserializa o `normalized`), `markAllocated`, `markDiscarded`
  - [x] **Interface HTTP** (+2 testes de rota): `POST /v1/intake/:id/allocate` (201) e `POST /v1/intake/:id/discard` (204)
  - [x] Provado no Supabase: webhook→fila→alocação criou 2 clientes por CPF, booking `pending` com snapshot COUPLE/COUPLE total 200000, intake virou `allocated` com grupo/booking vinculados; dado removido
  - [x] **Transação única (UnitOfWork)** ✅ (2026-08-26): `allocateFromQueue` agora escreve tudo numa transação só — criar/reaproveitar cliente, criar o booking, marcar o intake e gravar o aceite **vencem ou falham juntos**. Sem cliente órfão nem inscrição sem aceite. Port `UnitOfWork`/`AllocationRepositories` na aplicação (deps viraram `{ uow, clock }`); `passthroughUnitOfWork` para dev/in-memory/testes. Infra: `prismaUnitOfWork` abre `base.$transaction` e monta os 7 repos sobre a `tx`; o `tenantClient` ganhou um **proxy transacional** (fallback quando o client não tem `$extends`) que escopa cada operação **na própria `tx`** — as ramificações update/delete/upsert/findUnique da extension escapariam da transação pelo delegate do client original; o proxy corrige isso mantendo a mesma injeção de `tenantId`. `runInTransaction` evita transação aninhada no `prismaBookingRepository`. TDD: 10 testes unit (fakes via passthrough) + 3 de integração (`prismaUnitOfWork.integration.test.ts`: rollback ao lançar, commit ao retornar, escopo de tenant cruzado dentro da tx) — coletam limpos, faltam rodar num Postgres descartável (CI)
  - [x] **Divergência de dados (IN-04)** ✅ (2026-08-26): CPF já cadastrado chegando na alocação com **nome, nascimento, telefone ou e-mail diferentes** entra na **fila de revisão em vez de sobrescrever**. A alocação prossegue (reaproveita o cliente, IN-03) e a divergência vira pedido `pending` na fila — tudo na **mesma transação** da alocação (`AllocationRepositories` ganhou `identityRequests`). Função-coração nova, pura: `detectCustomerDivergence` (domínio, 10 testes) — ignora caixa/acento/espaço no nome, compara telefone só por dígitos e e-mail sem caixa, e nunca propõe apagar contato que veio vazio. A fila reusada é a do `IdentityChangeRequest` (PC-07), **estendida para carregar contato** (colunas `email`/`phone`, migration `20260826160000`); aprovar aplica identidade via `updateIdentity` e contato via novo `updateContactInfo` (parcial, sem tocar no endereço). DTO da equipe mostra o de→para de contato. TDD: +13 testes (10 domínio, 2 alocação, 1 aprovação de contato). Provado no Supabase: migration aplicada + baselinada (16 = 16 folders), round-trip do pedido com contato em `BEGIN…ROLLBACK`, sem resíduo
  - [x] **Reprocessar erro (IN-05)** ✅ (2026-08-26): falha de processamento **não perde o payload**. No webhook, o mapeamento roda em `try`: sucesso → `needs_allocation`; falha → grava o corpo cru como `error` com a causa (`campo: código`) e **ainda responde 422** no campo culpado (contrato do §5.7.1 mantido; linha 703 do PRD: campo obrigatório inválido gera 422 **e** marca `error`). Dedup passou a usar identidade estrutural (`readWpFlatIdentity`, novo no domínio) para ter o `externalId` mesmo quando o mapeamento completo falha — reenvio do mesmo entry cai em `duplicate`, sem segunda linha. Novo caso de uso `reprocessIntake` (só equipe, só quem está em `error`): reaplica o perfil ao payload preservado → `needs_allocation` + normalizado (limpa o erro), ou segue em `error` com a mensagem atualizada e relança 422. Rota `POST /v1/intake/:id/reprocess`; a fila (`GET /v1/intake`) passou a expor `error`. Sem migration (usa colunas já existentes de `intake_events`). TDD: +9 testes (receive grava error + dedup de reenvio; reprocess sucesso/falha/estado/escopo; rota fila+reprocess). `describeProcessingError` compartilhado, sem vazar mensagem interna
  - [x] **Divergência em acompanhante (IN-04)** ✅ (2026-08-26): a detecção de divergência passou a valer também para o **acompanhante** reaproveitado por CPF (nome/nascimento diferentes → fila de revisão, sem sobrescrever). Extraí `enqueueDivergence` (compartilhado por responsável e acompanhante; acompanhante não tem contato, só nome/nascimento). +1 teste
- [x] **Gestão de API keys (IN-21)** — provado no Supabase: `createApiKey` (só owner/admin, gera token CSPRNG + hash SHA-256, prefixo `epk_<env>_<slug>_`, **token completo aparece uma vez**), `listApiKeys` (mascarado `epk_..._••••`, nunca token/hash), `revokeApiKey` (revoga individual → depois 401 no webhook). Rotas `POST/GET/DELETE /v1/api-keys`. Provado: criar→listar mascarado→usar (202)→revogar→401
- [x] **Vitrine pública (IN-24)** — `listOpenGroups` (grupos `open`+`public` por slug, sem nada sensível) → `GET /v1/public/:tenantSlug/groups?status=open`, **sem autenticação** (CORS restrito). Provado 200
- [x] **Mapa form_id→roteiro (IN-20)** ✅ (2026-08-26): tabela `form_mappings` (`nova-tabela`: `tenant_id`, unique composto `(tenant_id, source, form_id)`, RLS **team-only** sem `customer_read`, migration `20260826170000`) → **21 tabelas no Supabase, todas com RLS**. O webhook **resolve o roteiro na chegada** pelo mapa e grava `itinerary_id` no intake (coluna já existia) — nos dois caminhos: sucesso e `error` (IN-05), já que o `form_id` é estrutural. A fila (`GET /v1/intake`) passou a expor `itineraryId`. Config em Configurações → Integrações: `setFormMapping` (owner/admin, upsert por `(source, form_id)`, valida roteiro existente), `listFormMappings` (equipe, de→para com nome), `removeFormMapping`. Rotas `GET/PUT/DELETE /v1/form-mappings`. Repo Prisma + fake + dev in-memory; `FormMapping` no escopo do `tenantClient`. TDD: +9 testes (5 use cases, 3 resolução no receive, 1 rota ponta a ponta) + teste de isolamento `formMappings.rls.test.ts` para o CI. Provado no Supabase: migration aplicada + baselinada (17 = 17 folders), RLS on, round-trip com FK em `BEGIN…ROLLBACK`, sem resíduo
  - [x] **Pré-seleção do próximo grupo (IN-20b)** ✅ (2026-08-26): a fila de alocação passou a sugerir, por item com roteiro resolvido, o **próximo grupo `open` do roteiro cuja saída começa hoje ou depois** (o de data mais próxima). Novo caso de uso `listAllocationQueue` (equipe) compõe intake + agenda e enriquece cada item com `suggestedGroupId`/`suggestedGroupName`; função pura `nextOpenGroup` (data de referência injetada, sem `new Date()`) faz a seleção. É só **sugestão**: a rota `GET /v1/intake` expõe os campos, mas a alocação continua exigindo a confirmação do admin (o `POST /allocate` recebe o `groupId` escolhido). Sem tabela/migration nova. TDD: +5 testes (mais próximo no futuro, ignora não-aberto, sem futuro → null, sem roteiro → null, escopo de equipe) + asserção na rota
- [x] **`GET /form-schema` público (IN-24)** ✅ (2026-08-26): `coreFormSchema()` no domínio descreve os campos que o formulário emite (`key`, `type`, `required`) + o bloco repetível de acompanhante. V1 é o núcleo fixo (sem `custom_field_definitions`, adiado no PRD §5.6.1). Rota `GET /v1/public/:tenantSlug/form-schema` **sem auth**, CORS restrito, rate limit apertado por IP — ao lado da vitrine. TDD: +4 (domínio) +1 (rota). Sem dado de cliente
- [x] **Perfil `canonical_v1` (IN-01b)** ✅ (2026-08-26): segundo perfil de mapeamento — objetos aninhados (`responsible`, `vehicle`, `companions[]`) → mesma forma interna (`MappedIntake`), mesmas regras de campo e **mesmos códigos de erro** do `wp_flat_v1`. Extraí `intakeFieldRules` (validação/normalização compartilhada; `IntakeValidationError` mudou de casa, re-exportado) e um **registro de perfis** (`resolveIntakeProfile`) por `source` — `receiveIntake` e `reprocessIntake` despacham por ele (o `findForReprocess` passou a devolver `source`). O webhook aceita `canonical_v1` pelo header `x-intake-source`. TDD: +7 (mapper) +1 (receive) + wp_flat refatorado sem regressão (13/13)

## Fase 5 — em progresso (históricos + cashback)

- [x] **Núcleo de cashback (§5.8)** — a 5ª função-coração, pura, 100% cobertura: `calculateCashback` (percentual sobre a base ou valor fixo) e `resolveCashbackRule` (config da empresa + override do grupo `inherit`/`off`/`custom`; `off`/desligado → null; `custom` é campanha e vale mesmo com o módulo geral desligado). + `addDays`/`addMonths` (aritmética de data civil)
- [x] **Tabela `cashback_entries`** (`nova-tabela`): ledger **append-only** (sem `deleted_at` — correção é entrada de ajuste), `amount_cents` BigInt com sinal, `available_from`/`expires_at` DATE; migration `20260825120000`, RLS habilitada → **20 tabelas no Supabase, todas com RLS**
- [x] **Aplicação (CB-03..08)** — provado no Supabase (11 testes de domínio/uso + 1 de rota):
  - [x] `accrueCashback` (CB-03/CB-04): libera ao **responsável**, base pago ou contratado, `available_from` = término + `release_days`, `expires_at` = +`validity_months`; cancelada não credita; idempotente por inscrição
  - [x] `redeemCashback` (CB-05/CB-06): lançamento **negativo**, limitado pelo saldo e pelo teto por inscrição (`max_redemption_pct` sobre o contratado); só owner/admin
  - [x] `getCashbackStatement` (CB-08): extrato + saldo **derivado** (SUM); config em `tenant.settings.cashback`, override em `groups.cashback_override`
  - [x] Rotas: `POST /v1/bookings/:id/cashback/accrue`, `.../redeem`, `GET /v1/customers/:id/cashback`
  - [x] Provado no Supabase: config ligada no tenant → accrual 6000 (5% de 120000 pago, disponível 14/12, expira +12m) → resgate −2000 → **saldo derivado 4000**; RLS provada (tenant errado 0, certo 2); dado e config revertidos
- [x] **Config de cashback (CB-01/CB-02)** — `getCashbackConfig` (leitura, equipe) e `updateCashbackConfig` (escrita, **owner/admin**) sobre `tenant.settings.cashback`; invariantes de faixa como erro de negócio (`invalid_cashback_config`: percentual 0..100, valor fixo ≥ 0, teto 0..100, dias/meses ≥ 0). Port `saveConfig` (fake/dev/prisma — merge no jsonb de settings). Rotas `GET`/`PUT /v1/cashback/config` (borda valida faixa com Zod). TDD: 8 testes de uso + 2 de rota. Provado no Supabase: settings `{}` → defaults off; save (5%/teto 50) persiste e a leitura reflete; revertido a `{}`
- [x] **CB-09 congelar a regra de cashback na inscrição** — `allocateBooking` resolve a regra vigente (config + override do grupo) e grava `cashback_rule_snapshot` (`{ rule: CashbackRule | null }`) na criação; `accrueCashback` usa **o snapshot da inscrição**, não a config ao vivo (só resolve ao vivo em inscrição antiga sem snapshot — retrocompatível). Cashback é passivo: mudar o percentual amanhã não altera o crédito de uma saída de ontem. Campo opcional em `NewBooking`/`BookingRecord` (fake/dev/prisma); `allocateBooking`/`allocateFromQueue` ganharam a dep `cashback`. TDD: alocação congela 5% e não muda ao mexer na config; accrual usa o snapshot ignorando os 10% da empresa; `{ rule: null }` = sem cashback. Provado no Supabase: o jsonb faz round-trip
- [x] **Cashback só na auto-inscrição do cliente pelo app (§5.8)** ✅ (2026-08-26): **regra de origem** — só a inscrição que o **próprio cliente** faz pelo portal (`source: 'portal'`) congela a regra de cashback; **equipe** (`manual`, inclusive o pacote de preço manual) e **webhook** congelam `{ rule: null }` (nunca geram crédito). É um benefício de fidelidade para cliente já cadastrado, sem custo de marketing. Domínio: `BOOKING_SOURCE` + `cashbackAppliesToSource` (`portal`). `allocateBooking` ganhou `source` no comando e só resolve a regra quando elegível; `allocateFromQueue` passa `webhook`, a rota da equipe passa `manual`, `allocateManualBooking` congela null (deixou de depender de `cashback`). Novo caso de uso `selfEnrollBooking` (o cliente inscreve a própria família numa saída **aberta e pública**, escopo de família; reusa `allocateBooking` com `source: 'portal'`) + rota `POST /v1/portal/groups/:id/enroll`. TDD: +2 no domínio, +4 `selfEnrollBooking`, +1 `allocateBooking` (manual não congela) + teste de rota de cashback reescrito (equipe → 0 crédito)
  - [x] **Grupo nasce aberto** ✅ (2026-08-26): `createScheduleEvent` passou a criar o grupo com `status: 'open'` (era `draft`) — já entra na **vitrine pública** e aceita a **auto-inscrição**. Fluxo completo provado por rota: cliente se inscreve pelo portal → `source: portal` → `accrue` credita 5% (equipe/webhook creditam 0). Testes ajustados (criação agora espera `open`)
  - [x] **A01 — roteamento por audiência fail-closed** ✅ (2026-08-26): **bug real** — conta de cliente (Vanessa) via **back-office da empresa**. Causa: o `auth.users` foi criado sem `app_metadata.role` (magic link/self-signup nasce só com `{provider}`), e o `App.tsx` tinha **fallback aberto** — qualquer sessão não-`customer` caía no `Shell`. Fix de dados: `raw_app_meta_data` corrigido (Vanessa → `customer`+`customer_id`, Heitor → `owner`), ver [[access-user-drk]]. Fix de código: função pura `resolveAudience(role, customerId)` → `portal`/`backoffice`/`denied` (**só papel de equipe conhecido abre o Shell**; sem papel/desconhecido/cliente-sem-id → negado) + tela **"Sem acesso"** (5º estado, só oferece sair). TDD: +9 testes (`resolveAudience.test.ts`, §3.7/A01) — **primeira suíte de teste do web**, roda no projeto `unit`. Back já era fail-closed (`verifyAccessToken`: papel desconhecido/sem tenant → 401). Exige relogar para o novo token valer
  - [x] **Ano e cor removidos do veículo (todas as camadas)** ✅ (2026-08-26): campos nunca solicitados (PC-06). Removidos de `SaveVehicleCommand`/`NewVehicle`/`VehicleRecord`, `saveVehicle`, `prismaVehicleRepository`, `saveVehicleBody`+`toVehicleDto` (rota equipe), `vehicleBody`+`vehicleDto` (portal), `useSaveVehicle`/`VehicleForm` (back-office) e do schema Prisma. Migration `20260826180000_drop_vehicle_year_color` (reversível) criada — **aplicar no SQL Editor** (DDL destrutivo bloqueado via MCP; 0 veículos no banco, nada a perder). Testes ajustados; typecheck/build/lint/markers limpos, 563 verdes
  - [x] **Portal — menu reordenado + "Minha conta" em 4 sub-abas + edição por membro** ✅ (2026-08-26): nav lateral reordenada (Início · Expedições · Roteiros · **Comunidade** · **Minha conta**). `PortalContaScreen` com sub-abas **Meus dados**, **Notificações** (a Comunicação/`ConsentsCard` saiu de Meus dados para cá), **Histórico de expedições** e **Histórico financeiro**. Em Meus dados, **card único** (`MeusDadosForm`, um só "Salvar" no fim): responsável no topo, depois cada acompanhante (com "Adicionar acompanhante"), por último o **veículo da família** (só aqui, é da família). Só o **contato** (e-mail/telefone) é editável pelo cliente; **nome, nascimento e CPF ficam bloqueados** (campos `disabled`) — identidade só a equipe altera, mediante solicitação. Botões "Adicionar acompanhante" (à direita) e "Salvar" em laranja (`btn-primary`). **Data de nascimento bloqueada** — campo `disabled` no front **e** no back: o schema de `POST /v1/portal/identity-change-requests` deixou de aceitar `birthDate`/`cpf` (Zod descarta), então nascimento/CPF só a equipe altera no back-office (teste PC-07 novo prova o descarte → `null`). DTO da família ganhou `email`/`phone` para pré-preencher. Corrigido crash do `MeusDadosForm` (`edits[id]` `undefined` quando a lista mudava) — estado agora é delta por membro com fallback ao valor original (`editOf`). 564 testes verdes. Reusa `ExpeditionsTab`/`FinanceTab`/`CashbackTab` (exportados de `CustomerScreen`); `ConsentsCard` perdeu o wrapper `page-wide` para encaixar como aba. Typecheck/build/lint/markers limpos, 563 verdes
  - [x] **Menu recolhível no portal + inversão de cores** ✅ (2026-08-26): o portal ganhou o mesmo **recolher de menu** do admin (hook `useSidebarCollapsed` compartilhado, persistido em `localStorage`). Ao recolher, a sidebar **inverte para o accent** do tenant (fundo laranja, ícones brancos; item ativo e marca invertem) com **transição suave** e respeitando `prefers-reduced-motion`. Vale para admin e portal
  - [x] **Auth real do servidor em dev (`SUPABASE_URL`)** ✅ (2026-08-26): **bug real** — sem `SUPABASE_URL`/JWKS/secret em `apps/server/.env`, `resolveContextForProd` caía no **stub de dev** (`DEV_ACTOR` de equipe) para toda requisição, então o portal do cliente nunca autenticava como cliente e `/v1/portal/*` com escopo de família dava 403 (sintoma: "Minha família" vazia). Adicionado `SUPABASE_URL` → JWKS ES256 derivada de `/auth/v1/.well-known/jwks.json`. `tsx watch` não relê o `.env` (reiniciar o processo). Ver [[access-user-drk]]
  - [x] **Portal com casca de sidebar + dashboard** ✅ (2026-08-26): o portal deixou o menu de abas no topo e passou a usar a **mesma casca do back-office** (`.app`/`.sidebar`/`.main`/`.topbar`) — nav lateral com ícones (Início, Expedições, Roteiros, Minha conta, Comunidade) + userbox. Nova aba **Início** (`PortalDashboardScreen`): card **"Sua próxima aventura"** (a inscrição futura mais próxima, com status/participantes/a receber; estado vazio com CTA), widget **"Próximas expedições"** (vitrine filtrada a 2 meses, cards) e botões **ver agenda completa** / **ver roteiros**. **Saldo de cashback no topo** (`CashbackBadge` na topbar, lê `/file`). Novos: `usePortalHome`, `format.ts` (datas/moeda, consolidando a duplicação do Expeditions), ícones `inicio`/`expedicoes`/`conta` no `NavIcon`. Typecheck/build/lint limpos, 563 verdes
  - [x] **Correções do portal do cliente** ✅ (2026-08-26): (1) **família não aparecia** na aba "Minha conta" — a ficha (`/file`) não traz acompanhantes; novo card **"Minha família"** lê `/v1/portal/family` (responsável + acompanhantes, escopo de família). (2) **Adicionar veículo** usava texto livre — trocado pelos **Comboboxes do catálogo** (`/v1/vehicle-brands` + cascata marca→modelo, opção "Outro"; back-end já aceitava `brandId`/`modelId`). (3) **Ano e cor removidos** do formulário do portal (não solicitados no PC-06). Typecheck+build+lint limpos, 563 testes verdes
  - [x] **UI do portal — vitrine + auto-inscrição** ✅ (2026-08-26): backend `listOpenExpeditions` (saídas `open`/`public` com roteiro + ocupação/vagas, ordenado por início) e `listPortalFamily` (responsável + acompanhantes, escopo de família) — rotas `GET /v1/portal/expeditions` e `GET /v1/portal/family`. Front: aba **Expedições** (`PortalExpeditionsScreen`) lista as saídas abertas com pill de vagas e botão inscrever → **modal com checklist da família** (escolhe quem vai) → `POST /enroll`; aba **Roteiros** (`PortalRoteirosScreen`, só leitura). `PortalApp` reorganizado em 4 abas (expedições/roteiros/conta/comunidade). Cinco estados em cada tela, só tokens do design system. TDD: +3 `portalBrowse.test.ts` (filtro/ordem/vagas, família, equipe 403) e +2 na rota do portal (família devolve responsável+acompanhante; expedições 200). Suíte 554 verde, lint/markers limpos, web typecheck+build limpos
- [ ] CB-07 validade: ~~job de `expiry` automático~~ ✅ + ~~saldo disponível por data~~ ✅ (ver "Varredura"); aviso ao cliente antes do vencimento ainda falta
- [x] Histórico consolidado do cliente/fornecedor — fichas CL-06 e FO-03 no ar, com extrato/saldo derivados do ledger (SUM), batendo com o que o cliente/fornecedor viu

## Autenticação real (§3.7) — verificação do JWT

- [x] **`verifyAccessToken`** (borda, TDD 8 testes): verifica o access token do Supabase Auth (HS256, `SUPABASE_JWT_SECRET`) via `jose` e mapeia **`app_metadata`** → `RequestContext` (nunca `user_metadata` — este é editável pelo usuário). Equipe: `role` ∈ owner/admin/operator/viewer + `tenant_id` → actor `team`. Cliente: `role: customer` + `tenant_id` + `customer_id` → actor `customer`. Qualquer falha (assinatura, expiração, claim ausente, papel desconhecido, cliente sem `customer_id`) → `UnauthorizedError` (401), sem distinguir motivo
- [x] **`makeJwtResolveContext`** liga isso no `resolveContext` do server: lê `Authorization: Bearer`, resolve o tenant **do próprio token** (não de header/slug). `main.ts` usa auth real quando `SUPABASE_JWT_SECRET` existe; senão avisa e cai no stub de dev
- [x] **JWKS / signing keys assimétricas (§3.7)** — `verifyAccessToken` generalizado para aceitar **segredo HS256 (legado)** OU um **resolvedor JWKS** (`createRemoteJWKSet`), com os algoritmos fixados por modo (`HS256` vs `ES256/RS256`) para fechar **confusão de algoritmo**. `makeJwksResolveContext(jwksUrl)` novo; `main.ts` escolhe: `SUPABASE_JWKS_URL` explícito → JWKS; senão `SUPABASE_JWT_SECRET` → HS256; senão JWKS derivado de `SUPABASE_URL` (`/auth/v1/.well-known/jwks.json`); senão stub. +3 testes: token ES256 verificado pela chave pública; HS256 recusado quando só ES256/RS256 valem; ES256 recusado na via HS256
- [x] Provado contra o server rodando (secret configurado): sem token → 401; JWT válido → 200 com o tenant resolvido do `app_metadata` (15 roteiros do Drakkar); token adulterado → 401; token de outro segredo → 401. Vitrine pública segue 200 sem auth; webhook exige a própria `api_token` (401 sem ela)
- [x] **Front autenticado (§3.7)** — `@supabase/supabase-js` no navegador (URL + **chave publicável** do `.env`, `persistSession`+`autoRefreshToken`+`detectSessionInUrl`). **Portão de login** (`App` divide-se em portão + `Shell`): sem sessão só a tela de login existe; com sessão, a casca. Login com **os dois métodos** — senha (`signInWithPassword`) e **magic link** (`signInWithOtp`, `emailRedirectTo` = origem) na mesma tela. **Wrapper `api()`** injeta `Authorization: Bearer <access_token>` em toda chamada — os 16 hooks passaram a chamá-lo em vez de `fetch` cru, então a auth vive num lugar só. Rodapé da sidebar com e-mail + **Sair** (`signOut`); `onAuthStateChange` troca a tela sozinho (login/logout/refresh/retorno do link). `tsc` + `vite build` limpos
  - **Não verificado ponta a ponta aqui** (sem navegador nem entrega de e-mail; o server em dev usa stub): confirmado por typecheck/lint/build e pela fiação do token. Para valer em produção, o usuário do Supabase Auth precisa de `app_metadata.{tenant_id, role}` (o `verifyAccessToken` recusa sem isso) e `SUPABASE_JWT_SECRET` no server
- [x] **Convite de membro de equipe (§3.7)** — cria o usuário no Supabase Auth com `app_metadata.{tenant_id, role}` (o que a RLS lê). Camadas: port `AuthAdminGateway` (aplicação) + caso de uso `inviteTeamMember` (TDD, 7 testes) + infra `supabaseAuthAdmin` (Admin REST via `fetch`, `service_role` só no servidor; cria usuário + gera magic link) + rota `POST /v1/team/invitations` (4 testes de rota). **Segurança**: tenant vem do JWT do inviter (nunca do corpo); só owner/admin convidam; papel concedido restrito a admin/operator/viewer — **owner e customer barrados** (sem escalonamento). Sem a `SUPABASE_SERVICE_ROLE_KEY`, a rota responde **503** em vez de fingir. UI: card **Equipe** em Integrações (e-mail + papel → link de acesso no callout para entrega manual)
  - **Não verificado ponta a ponta aqui** (a Admin API do GoTrue exige a `service_role` key, ausente do ambiente, e criaria usuário real): confirmado por typecheck/lint/build + os 11 testes com gateway fake. A sequência REST (admin/users com `app_metadata` → admin/generate_link) segue o contrato do GoTrue
- [x] **401 no `api()` força re-login** — no `401`, o wrapper renova a sessão **uma vez** (`refreshSession`, single-flight para 401 concorrentes) e repete a chamada; se ainda falhar, `signOut` e o `onAuthStateChange` leva ao login. `403` não desloga (é papel, não sessão). Verificado por typecheck/lint/build (web não tem suíte unit)
- [x] **RLS por audiência `role = customer` (§3.7 / PC-05)** — migration `20260825130000_customer_rls` (aplicada no Supabase). Helpers de JWT (`app.current_role`, `app.current_customer_id`) + helpers **`SECURITY DEFINER`** de família (`current_family_ids`/`_booking_ids`/`_group_ids`, contornam a RLS para não recorrer). A `tenant_isolation` de **todas as 19 tabelas** passou a valer só para **não-cliente** (`app.current_role() IS DISTINCT FROM 'customer'`) — senão um JWT de cliente leria o tenant inteiro (OR de policies permissivas). O cliente ganhou **`customer_read` (SELECT-only)** escopada à **própria família** em customers/vehicles/bookings/booking_participants/booking_payments/cashback_entries + o contexto da saída (groups/schedule_events/itineraries/itinerary_prices). **Sem policy de cliente** em suppliers/supplier_expenses/supplier_payments/api_keys/intake_events/memberships/tenants → lê **zero linha**. Escrita do cliente negada pela RLS (portal escreve pelo servidor)
  - **Provado no Supabase (sessão por papel)**: cliente da família 1 vê 2 clientes (self+acompanhante, **não** a família 2), 1 booking/participante/pagamento/cashback, **1 roteiro** (o da saída, não os 15), e **0 fornecedores/despesas/api_keys**; família 2 vê só a si; cross-tenant vê 0; **INSERT do cliente → "violates row-level security"**; equipe (owner) segue vendo o tenant inteiro (3/1/15). Dados removidos
  - **Teste de CI** `customerAudience.rls.test.ts` (7 casos, PC-05/§3.7) por sessão de papel; o testkit passou a aplicar **todas** as migrations em ordem (antes só a init), então a RLS de cliente é exercida contra o schema completo. `TenantSession.openCustomer(tenant, customerId)` novo
- [x] **Escrita do cliente (PC-06/PC-08)** — mediada pelo servidor (a RLS do cliente é SELECT-only): casos de uso de portal atrás de um **guarda de família** (`familyScope`: equipe gerencia o tenant; cliente só a própria família, pelo mesmo "head"). **PC-06** `updateCustomerContact` (contato + endereço; **nunca** nome/CPF/nascimento — PC-07) e `savePortalVehicle` (reusa `saveVehicle` atrás do guarda); **PC-08** `registerFamilyCompanion` (cria acompanhante sob o head do ator — responsável nunca vem do corpo). Port `updateContact` (fake/dev/prisma). Rotas `PATCH /v1/portal/customers/:id/contact`, `POST /v1/portal/companions`, `POST /v1/portal/vehicles` (DTO com CPF mascarado). TDD: 7 testes de uso + 5 de rota (inclui **403 ao tocar outra família**). Provado no Supabase: `updateContact` muda contato/endereço e **deixa identidade intacta**; dado removido
- [x] **Fila de aprovação de identidade (PC-07)** — mudança de nome/CPF/nascimento **não aplica na hora**: entra numa fila e a equipe decide. **Tabela `identity_change_requests`** (`nova-tabela`: `tenant_id`, id UUID, índices `(tenant_id, status)`/`(tenant_id, customer_id)`, FKs cascade; migration `20260825140000`) já nasce com **RLS por audiência** — `tenant_isolation` role-guarded (equipe) + `customer_read` SELECT escopada à família (`check:rls` OK, **20 tabelas nas migrations, todas com RLS**). Casos de uso (TDD, 9 testes): `requestIdentityChange` (portal, escopo de família, valida CPF/unicidade, nasce `pending`), `listIdentityChangeRequests` (back-office, de→para com CPF mascarado), `decideIdentityChange` (owner/admin; **aprovar aplica** ao cliente via `updateIdentity` + rechecagem de CPF, **recusar arquiva**; só `pending`). Rotas: `POST /v1/portal/identity-change-requests`, `GET`/`POST .../decision` (+4 testes de rota). Provado no Supabase: cliente vê o próprio pedido (1), outra família 0, **INSERT do cliente negado pela RLS**; teste de CI cobrindo a nova tabela
- [x] **Tela de aprovações de identidade (PC-07)** no back-office — **lista de cartões** (cada pedido exige decisão própria): cliente, **de→para** (nome/CPF/nascimento, valor antigo tachado → novo, CPF mascarado), motivo; **Aprovar** (accent, aplica a mudança) e **Recusar** com nota. Cinco estados; nav "Aprovações de identidade"; hook `useIdentityApprovals`. `tsc` + `vite build` limpos
- [x] **Rate limit dedicado (SEC-14/IN-23)** — além do global de 100/min: **webhook** `POST /v1/intake/:tenantSlug` limitado **por chave** (`api_token`, caindo no IP sem token) a 120/min — uma integração barulhenta não afeta as outras; **vitrine pública** `GET /v1/public/:tenantSlug/groups` a 30/min por IP. O error handler passou a **repassar o 4xx** de erros HTTP do Fastify (o 429 do rate limit virava 500). Teste: 31º pedido na vitrine → 429 (`rate_limited`)
- [x] **Portal do cliente (§3.7)** — a audiência decide a casca: `useAuth` expõe `role`/`customerId` do `app_metadata`; `role: customer` → **`PortalApp`**, equipe → back-office. Backend relaxado: `getCustomerFile` e `getCashbackStatement` deixam o **cliente ler só a própria família/o próprio extrato** (mesmo guarda de família da escrita; testes atualizados). O portal reusa a `CustomerScreen` (ficha própria: expedições/financeiro/cashback, sem navegação de back-office) + card **"Meus dados"**: editar contato (PC-06), adicionar acompanhante (PC-08) e **pedir mudança de identidade** (PC-07, vira aprovação). Casca própria (marca + e-mail + Sair), hook `usePortalActions` sobre o `api()` autenticado. `tsc` + `vite build` limpos
- [x] **Veículo no portal (PC-06)** — form no card "Meus dados" (placa + marca/modelo texto "Outro" + ano + cor), sobre `savePortalVehicle`; hook `usePortalActions.addVehicle`
- [x] **Convite do cliente ao portal (PC-01/PC-02)** — `invitePortalCustomer` (TDD, 5 testes de uso + 2 de rota): owner/admin convida um cliente **adulto com e-mail**; cria a conta no Supabase Auth com `app_metadata.{tenant_id, role: customer, customer_id}` (gateway estendido; infra compartilha o create+magic-link com o convite de equipe) e **liga a conta** (`auth_user_id` + `portal_status: invited` + `invited_at`, novo `linkAuthUser`). Rota `POST /v1/customers/:id/portal-invite` (503 sem a Admin API). UI: botão **"Convidar ao portal"** na ficha (só back-office, só responsável) com callout do link. Provado no Supabase: `linkAuthUser` grava `auth_user_id`/`portal_status`/`invited_at`; a criação do usuário no GoTrue precisa da `service_role` (não verificável aqui, mesmo limite do convite de equipe)
- [ ] Follow-up restante: resposta idêntica p/ e-mail existente/inexistente no login (é do Supabase, magic link); verificação real ponta a ponta do portal (agora destravável: convidar um cliente real → abrir o link → o token carrega `customer_id`)

## Notificações por e-mail (PC-23)

- [x] **Aplicação** (TDD, 4 testes PC-23): port `NotificationGateway.sendBookingNotification` + caso de uso `notifyBooking` — carrega a inscrição (`NotFoundError` se não existe), resolve o **e-mail do responsável** (cliente sem e-mail → `{sent:false}`, gateway não é chamado), resolve o grupo (nome + datas) e dispara `received`/`confirmed`. O caso de uso é puro; o efeito colateral (envio) fica na borda. Fake `fakeNotificationGateway` (com modo `failing`) para os testes
- [x] **Infraestrutura**: `resendNotificationGateway` — POST `https://api.resend.com/emails` com `Bearer` (assunto/HTML por tipo, `escapeHtml` nos valores dinâmicos, erro em resposta não-ok). A `RESEND_API_KEY` é segredo, só no servidor
- [x] **Interface HTTP** (+1 teste de rota): helper `fireBookingNotification` (**best-effort** — try/catch + `log.warn`, nunca derruba a requisição; no-op quando o gateway não está configurado) disparado **depois do commit**: `received` ao alocar (rota de bookings e alocação da fila) e `confirmed` no primeiro recebimento (`result.confirmedNow`, IN-08). `notifications?` opcional em `ServerDeps` (como o `authAdmin`); `main.ts` só liga o Resend quando `RESEND_API_KEY`+`RESEND_FROM` estão no ambiente, senão avisa e segue desligado
- [ ] Follow-up: aviso de cashback disponível/a expirar (CB-07); template HTML com identidade do tenant (hoje é texto simples)

## UI — front (React + Vite, design-system)

- [x] **Casca do app**: sidebar (marca + navegação por **seções** com **ícone + rótulo** — Operação / Análise / Sistema, item ativo em `--o-soft`/`--o`) + barra superior com trilha e alternadores de **modo e densidade**; fundo topográfico; roteamento por estado. **Menu expansível**: recolhe para uma trilha de ícones (persistido em `localStorage`), e o **conteúdo tem rolagem própria** — a sidebar fica fixa (100vh), sem scroll vertical/horizontal. Ícones inline SVG (`currentColor`, sem asset). Só token, nada hard-coded; responsivo (sidebar some ≤720px)
  - Navegação: **Visão geral, Agenda, Inscrições** (era "Fila de alocação"), **Clientes** (era "Clientes e famílias"), **Fornecedores, Roteiros** (novo), **Relatórios, Comunidade, Configurações** (novo — reúne Integrações, Documentos e Aprovações de identidade em abas)
- [x] **Roteiros (RO-01..03)** — índice em tabela (nome, dificuldade, faixas etárias, situação) + **modal de novo roteiro** (nome, dificuldade, idades, **preço inicial** com campo de dinheiro R$) e **reajuste** por roteiro (nova versão de preço com `valid_from` — nunca altera inscrição feita). Sobre `POST /v1/itineraries` e `/:id/prices` já existentes; hook `useItinerariesAdmin`. Cinco estados; só token. Fecha o "onde crio/gerencio roteiros"
- [x] **Configurações** — tela com abas (Integrações / Documentos / Aprovações de identidade), reunindo o que eram entradas soltas de menu
- [x] **Clientes e famílias** (CL-03/CL-04) — já existia: busca em pílula → famílias em cartão + acompanhante inline; cinco estados; dois modos/densidades
- [x] **Agenda (AG-01/AG-02/AG-06)** — grade de calendário em **três visões** (chips de interface mês/semana/lista): mês (célula `min-height:118px`, dias fora em `--card-2`, **hoje** em `--o`), **semana** (células altas, cartão cheio com roteiro + ocupação) e **lista** (linhas cronológicas com data, roteiro e ocupação). **Filtro por roteiro e status** (dois `select`, "Limpar filtros"). **Ocupação (AG-06)**: cada evento mostra confirmadas/vagas (`2/4`), pendentes à parte, e a **borda esquerda é cor de dado** — `--go` lotado, `--o` com vaga (privado = traço tracejado, AG-07); sem limite → só a contagem. Navegação mês/semana + "Hoje"; modal "Novo evento". **Seis estados** (esqueleto, erro+retry, vazio-convite, **filtro-sem-resultado**). Só token, nada hard-coded. Backend novo: `listAgendaEvents` + `bookings.countByGroup` (`groupBy` agregado, não N+1) → `GET /v1/schedule-events` traz `occupancy`. TDD: +3 no use case + asserção na rota
  - Web compila e builda limpo (`tsc --noEmit` + `vite build`). Provado contra a API pelo **proxy do Vite** (mesma origem da tela): criar evento pelo fluxo do modal → aparece na listagem que o calendário consome; dado de teste removido
- [x] **Mesa do grupo — Tabela 1 (GR-07/GR-13/GR-12/GR-06)**: cabeçalho (nome + pill de estado + datas/modo/ocupação) + **faixa de estatísticas** (confirmado/projetado/recebido/a receber) + **barra de meta segmentada** (recebido `--go` / a receber `--o` / vagas `--relief`) + **tabela de famílias** (avatar por estado, nome, pessoas, contratado/recebido/a receber, **barra inline de pago %**, pill de situação, check de NF) com **rodapé de totais**. Cor é dado (verde/cinza/vermelho); accent só na barra "a receber". Navegação: clicar num evento da agenda abre o board (trilha Agenda / Grupo). Cinco estados. Hook `useGroupBoard`
  - Backend enriquecido: `getGroupBoard` agora resolve `responsibleName` por linha (dep `customers`); DTO/rota/testes atualizados
  - Web compila e builda limpo; provado contra a API (proxy do Vite): grupo com casal confirmado (recebido, NF ✓) + solo pendente → linhas com nome, contratado 200000/120000, rodapé confirmado 200000/projetado 320000/recebido 120000, ocupação 1/5; dado removido
- [x] **Ações na mesa** — linha expandível (abre em `--card-2`, sem modal): **lançar recebimento** (GR-05; valor/forma/data → o primeiro confirma, IN-08), **marcar/desmarcar NF** (GR-06, número opcional), **confirmar sem pagamento** (IN-10, só se pendente, motivo), **cancelar inscrição** (IN-15/16, motivo, botão destrutivo com borda `--no` — a cor não muda, o verbo carrega a intenção). Feedback inline por tipo (sucesso financeiro verde, cancelamento/erro vermelho, NF cinza); hook `useGroupActions` faz POST e dá refresh no board
  - Provado contra a API: recebimento 40000 → `pending→confirmed`, recebido 40000, ocupa vaga; marcar NF → `true`; cancelar → `cancelled` com o recebimento **preservado no ledger** (IN-16) e vaga liberada; web builda limpo; dado removido
- [x] **Override manual na mesa (GR-04)** — no painel da linha: um campo por participante (rótulo com nome/categoria, valor atual pré-preenchido) + **motivo obrigatório**; envia só os que mudaram (`POST /v1/bookings/:id/price-overrides`), o total segue derivado. Provado no Supabase: unitário 120000→90000, `price_source` vira `override`, motivo gravado
- [x] **Excluir recebimento na mesa (IN-11)** — o painel lista os recebimentos ativos (`GET /v1/bookings/:id/payments`, novo — rota fina sobre `listByBooking`) com **excluir** (`DELETE /v1/payments/:id`). Se era o único de uma confirmada, **faixa cinza operacional** avisando que a inscrição segue confirmada e a decisão é da equipe (não reverte sozinho). Provado no Supabase: soft-delete → recebimentos ativos 0, status permanece `confirmed`. Ações restritas a owner/admin no backend
- [x] **Fila de alocação (§5.7.2 / IN-17..19)** — **lista de cartões** agrupada por roteiro (`formId`); cada cartão: responsável, **CPF mascarado** (SEC-04), acompanhantes, data desejada, "há X" (de `received_at`), avisos em **pill neutra**, **faixa de alerta cinza** quando parada ≥24h (IN-12, operacional → cinza, nunca âmbar). Ações: **alocar num grupo** (seletor + primário) e **descartar com motivo** (IN-19). Cinco estados; hook `useQueue`
  - Backend enriquecido: `GET /v1/intake` devolve resumo por item (`toQueueItem`: nome, CPF mascarado, nº acompanhantes, data desejada, `received_at`, avisos); port/DTO/fake/dev atualizados; teste de rota afirma nome + CPF mascarado + acompanhantes
  - Provado contra a API: webhook → fila (Rui Alves CPF `529.***.***-25`, data desejada) → **alocar** (fila esvazia, grupo ganha a família com 2 pessoas) e **descartar** (204); web builda limpo; dado removido
- [x] **Ficha do cliente (CL-06)** — padrão "cabeçalho de entidade + abas + tabela": cliente no topo (avatar `--o-soft`, nome, **CPF mascarado** SEC-04, telefone/e-mail) + três **abas** (estado de interface → accent do tenant): **Expedições** (roteiro, datas, papel, pessoas, pill de situação — linha abre a mesa do grupo), **Financeiro** (contratado/recebido/**a receber** `--o` por saída + rodapé de totais das ativas), **Cashback** (stat de saldo + extrato: tipo, disponível em, expira em, valor — crédito em `--go`). Cinco estados (esqueleto, erro+retry, vazio por aba). Aberta pelo nome do responsável ou pelo cartão do acompanhante na tela de Clientes; trilha Clientes / Ficha. Hook `useCustomerFile`
  - Backend novo: caso de uso `getCustomerFile` (TDD, 5 testes CL-06) agregando expedições + financeiro derivado (contratado = SOMA dos unitários; recebido = SOMA dos recebimentos; a receber = 0 se cancelada) + extrato de cashback; port `listByCustomer` (responsável **ou** participante) no repo de inscrições (fake/dev/prisma); rota `GET /v1/customers/:id/file` com DTO mascarado e datas ISO (2 testes de rota). Sem tabela nova — leitura pura
  - Provado no Supabase real: vertical semeada (família + saída + booking 2 pessoas + recebimento + cashback) → `listByCustomer` do **acompanhante** acha a saída da família (via OR de participantes), contratado 200000/recebido 50000/a receber 150000, saldo 5000; dado removido (0 resíduo, 15 roteiros seed). Web builda limpo (`tsc` + `vite build`)
- [x] **Fornecedores (FO-01)** — índice em tabela (nome, documento+tipo, contato) com **cadastro inline** (`POST /v1/suppliers`); linha abre a ficha; cinco estados; hook `useSuppliers`
- [x] **Ficha do fornecedor (FO-03)** — padrão "cabeçalho de entidade + abas + tabela": fornecedor no topo (avatar neutro, nome, **doc mascarado se CPF**, contato) + três **abas**: **Saídas** (roteiro, datas, contratado/pago/**em aberto** `--o`, rodapé de totais — linha abre a mesa do grupo), **Pagamentos** (extrato: data, saída, descrição, forma, valor + total) e **Dados fiscais** (lista de definição). Cinco estados; hook `useSupplierFile`; trilha Fornecedores / Ficha
- [x] **Editar fornecedor + categorias (FO-04)** — tabela `supplier_categories` (por tenant, RLS só-equipe, aplicada no Supabase — **35 tabelas**) + `category_id` no fornecedor. Casos de uso `updateSupplier` (revalida doc/dedup excluindo o próprio; categoria do tenant; `PATCH /v1/suppliers/:id`), `createSupplierCategory` (idempotente por nome) e `listSupplierCategories` (`GET/POST /v1/supplier-categories`). UI: formulário compartilhado `SupplierForm` (cadastro + edição na ficha via "Editar dados") com **seletor de categoria + adicionar nova inline**; coluna Categoria na lista; documento só é reenviado se mudou (não corrompe CPF mascarado). Base para o relatório de gastos por categoria.
- [x] **Margem na mesa do grupo (GR-08/09/10)** — seção "Resultado do grupo" abaixo da Tabela 1: **faixa de estatísticas** (receita confirmada, gastos, **margem bruta** verde/vermelho conforme o sinal com o % da receita, a pagar) + **tabela de despesas** (fornecedor, descrição, contratado, pago, em aberto `--o`, rodapé de totais) com **pagar fornecedor** inline (GR-09) e **lançar gasto** (GR-08, seletor de fornecedor). Hook `useGroupResult` (result + expenses + suppliers num fetch só)
- [x] **Integrações (IN-21 · CB-01/CB-02)** — dois cartões: **Chaves de API** (listar/criar/revogar; o **token completo aparece só uma vez** num callout "copie agora", pill ativa verde / revogada vermelha) e **Cashback** (switch geral do módulo + regra percentual/valor fixo, base, liberação, validade, teto; grava com `PUT`, erro de faixa tratado). Hooks `useApiKeys`/`useCashbackConfig`; switch do design system (trilho 44×26)
- [x] **Portão de login + token no front** — ver "Autenticação real" (front autenticado): tela de login (senha + magic link), wrapper `api()` com `Authorization: Bearer` em todos os hooks, rodapé com Sair

## Próximas fases (§7)

1. Clientes e famílias, fornecedores, roteiros, configurações
2. Agenda + grupos + inscrição manual
3. Financeiro: recebimentos, gastos, pagamentos, NF, margem
4. Webhook + fila de revisão
5. Históricos + cashback
6. Push + e-mail marketing
7. Portal do cliente
8. Comunidade
9. Empacotamento Capacitor

Cada requisito entra por TDD: teste vermelho citando o id (§10.3) antes de qualquer implementação.

## Varredura de fechamento (2026-08-26)

**Suítes.** Unit: **462 verdes**; typecheck / lint / markers (`check:markers`) / prettier limpos; `apps/web` builda. Integração/RLS: 5 arquivos (`*.integration.test.ts` / `*.rls.test.ts`, hoje só de clientes) — carregam sem erro de import, mas o setup exige `TEST_DATABASE_URL` e é **destrutivo** (`resetSchema`); **não roda contra o Supabase do drk**, só num Postgres descartável (`supabase start` local ou o serviço do CI). Observação: o `tsconfig` da infra **exclui `*.test.ts`**, então esses arquivos não passam pelo gate de `typecheck` — só pelo vitest.

**Lacuna nº 1 — testes de isolamento das tabelas novas (SEC-01).** ✅ **Escritos** (2026-08-26): `documentsAudience.rls.test.ts` (audit_logs, legal_documents, legal_document_versions, document_acceptances, communication_consents, media_consents) e `community.rls.test.ts` (posts, post_media, post_likes, post_comments, post_reports) — cobrem as 10 tabelas: isolamento entre tenants, o cliente lendo só a versão publicada/o próprio aceite/consentimento, e auditoria/denúncia invisíveis ao cliente. Ambos **coletam sem erro de import/sintaxe**; o SQL do seed foi validado contra o Postgres real (transação `BEGIN…ROLLBACK`, sem resíduo). **Falta só rodá-los** num Postgres descartável (`TEST_DATABASE_URL` / CI) — como os 2 arquivos de RLS que já existiam.

**Lacuna nº 2 — baseline do Prisma + config do Supabase.** ✅ **Resolvida** (2026-08-26). O `drk` foi **baselinado**: as 8 migrations aplicadas via MCP (`customer_rls`…`media_consents_and_featured`) foram registradas em `_prisma_migrations` com o **checksum correto** (sha256 do `migration.sql`, o mesmo que o Prisma usa) — agora há 15 registros = 15 folders, e `migrate deploy` é no-op. Artefatos duráveis criados: `scripts/baseline.mjs` (`db:baseline`/`db:baseline:dry` — computa o diff e registra o que falta, para qualquer banco montado via MCP); `prisma/supabase-setup.sql` (`db:supabase-setup` — bucket `community` + policies de Storage + Realtime, **idempotente**, verificado re-rodando no drk); e o runbook `docs/deploy.md` (ordem para ambiente novo × ambiente-MCP). Storage/Realtime seguem fora do Prisma por mexerem no schema `storage`/publicações.

**Verificação de navegador pendente.** Pipeline de mídia (compressão Canvas, HEIC via `heic2any`, URL assinada) e Realtime são código de browser — verificados por typecheck/build e com a infra aplicada no Supabase, mas **não executados num navegador real** aqui. Precisam de um teste manual: subir o front, logar como cliente, publicar uma foto, ver curtida ao vivo.

**Faltando para o v1 (por prioridade).**
- **Alto:** rodar num Postgres descartável (CI) os testes de integração/RLS já escritos — isolamento das tabelas novas (lacuna 1 + `formMappings.rls.test.ts`) e a atomicidade do UnitOfWork (`prismaUnitOfWork.integration.test.ts`). **UnitOfWork, IN-04, IN-05 e IN-20 (`form_mappings`) feitos** — ver Fase 4.
- **Médio:** ~~CB-07~~ ✅; ~~grupo `pricing_mode: manual` (AG-08)~~ ✅; ~~validação de dígito de CPF/CNPJ do fornecedor~~ ✅; ~~`empresa_nome`/`empresa_cnpj` no snapshot do termo~~ ✅; ~~AG-01 (mês/semana/lista)~~ ✅; ~~AG-06 (ocupação no calendário)~~ ✅ — **tudo feito** (backend na "Varredura"; UI de agenda em "UI — front").
- **Baixo/ops:** provisionar Railway em us-east (SEC-16); `unaccent` para busca sem acento; galeria de fotos do roteiro (`itinerary_photos`/Storage, RO-04); template HTML de e-mail com identidade do tenant. (`canonical_v1` IN-01b **feito** — ver Fase 4.)

### Backend pendente da varredura — feito (2026-08-26)

Quatro itens de backend do "Médio" que tinham ficado para trás, todos TDD, **sem migration** (usam tabelas/colunas existentes) e **sem mudança no Supabase**:

- **`empresa_nome`/`empresa_cnpj` no snapshot do Termo (DOC-08)** — o aceite do site (`allocateFromQueue`) congelava a empresa como `null`. Novo port `TenantRepository` (`getCompanyInfo`, lê `tenants.name`/`cnpj`), injetado fora da transação; `resolveTermVariables` recebe nome + CNPJ do tenant. Prisma + dev in-memory; +2 asserções no teste do aceite.
- **Dígito verificador de CPF/CNPJ do fornecedor (FO-01/FO-03)** — value object `Cnpj` no domínio (branded, mesma forma do `Cpf`; 4 testes). `createSupplier` valida o documento pelo `docType` ou **inferindo pelo tamanho** (11=CPF, 14=CNPJ); tamanho estranho → `invalid_supplier_doc`. `InvalidCnpjError` mapeado para 422. +4 testes de uso.
- **Grupo `pricing_mode: manual` (AG-08)** — novo caso de uso `allocateManualBooking`: valor livre do pacote congelado, **sem categorias por idade** (categoria `MANUAL` nova no domínio; o núcleo de preço nunca a produz). Total no responsável, demais em 0; cashback congelado (CB-09). Rota `POST /v1/groups/:groupId/manual-bookings`; rótulo "pacote" na UI. +4 testes de uso + 1 de rota.
- **CB-07 — expiração + saldo disponível por data** — função-coração pura `availableCashback` (saldo **disponível** = sem crédito não liberado nem vencido, netando resgate por inscrição; 8 testes); `getCashbackStatement` expõe `availableCents`. Caso de uso `expireCashback` (job da equipe): lança `expiry` do remanescente de cada crédito vencido, **idempotente** (5 testes). Port `listExpiredCredits` (Prisma `groupBy` + dev in-memory); rota `POST /v1/cashback/expire`. Total: +13 testes.

**Suíte agora: 538 unit verdes**; typecheck / lint / markers / prettier limpos.

**Métrica de sucesso do v1** (fechar uma expedição inteira sem planilha): **coberta** — inscrição (manual + webhook), recebimentos, gastos, NF, margem por saída e o fechamento consolidado nos Relatórios existem e estão provados.

### Agenda — excluir e cancelar saída (AG-04/AG-05) ✅ (2026-08-27)

**Régua decidida com o dono do produto:** saída **sem lançamento nenhum** (inscrição, recebimento ou gasto com fornecedor) pode ser **excluída**; havendo qualquer lançamento, só **cancelada** — e cancelada **não some** da agenda. Devolução e cashback são avaliados **caso a caso** pela equipe, então o cancelamento não toca em inscrição nem em dinheiro.

- **`deleteScheduleEvent` endurecido** (+1 teste): além de `group_has_bookings`, agora barra `group_has_expenses` — gasto com fornecedor existe sem inscrição, e antes escapava. Recebimento pendura no booking, então a dupla cobre tudo
- **`cancelGroup` novo** (TDD, 4 testes): marca `groups.status = 'cancelled'` (a coluna já previa o estado, faltava o caminho), **motivo obrigatório**, audita `group.cancel` com `{from, reason}`, recusa cancelar duas vezes (`already_cancelled`) e **exige owner/admin**. Não mexe nas inscrições — elas seguem como estão, para a equipe decidir uma a uma. O grupo cancelado sai da vitrine pública e da auto-inscrição de graça: ambas filtram `status: 'open'`
- **Port `updateGroupStatus`** (fake/dev/prisma; `toGroupRecord` extraído no repo Prisma). Sem migration — a coluna e os estados já existiam
- **HTTP**: `POST /v1/groups/:groupId/cancel` (+1 teste de rota: 200 com status cancelado, 400 `already_cancelled`, 400 na borda sem motivo). `scheduleEventId` passou a sair no DTO do board (+1 asserção) — editar e excluir agem no evento, não no grupo
- **Provado ao vivo** (2026-08-27): agenda → mesa → menu Saída → Excluir saída → DELETE 204 e volta para a agenda. O relato de "o botão não funciona" era o board em memória **sem** `scheduleEventId` (o HMR do Vite troca o código mas não refaz o fetch): o clique caía num `return` mudo. Corrigido — sem o id do evento a tela agora **diz** para recarregar (`missing_event`, +1 teste), nunca fica em silêncio
- **UI**: menu **Saída** no cabeçalho da mesa (agenda → clicar no evento → mesa), com **Editar datas**, **Cancelar saída** (modal com motivo obrigatório) e **Excluir saída** (modal de confirmação, item destrutivo em `--no`). Ação que não cabe fica **visível e desabilitada com o motivo** — regra pura em `scheduleActions.ts` (**+10 testes**), erro do servidor traduzido em `scheduleErrorFor`. Excluir volta para a agenda; cancelar recarrega a mesa

### Devolução e conversão em crédito (§3.6) ✅ (2026-08-27)

**Régua do dono do produto:** saída cancelada normalmente devolve tudo; **até a devolução ser lançada, o valor segue somando receita**. Devolvido em dinheiro, vira devolução; virando cashback, não é nem receita nem despesa.

- **Ledger com natureza**: `booking_payments.kind` — `payment` (entrada) | `refund` (devolvido) | `cashback` (virou crédito). Devolução e conversão entram com **valor negativo**, então **toda soma de "recebido" já sai líquida** (mesa, ficha do cliente, dashboard e relatório financeiro) sem tocar em nenhum dos cinco pontos de cálculo. O recebimento original **permanece** — contrapartida, não apagão
- **`registerRefund`** (TDD, 9 testes): teto pelo recebido (`refund_exceeds_received`), motivo obrigatório, owner/admin. Destino `cashback` cria a entrada no extrato (`adjustment`, **disponível já e sem validade** — é dinheiro do cliente, não bônus) e nunca vira despesa. **Devolução integral cancela a inscrição no mesmo ato** (decisão do dono do produto — dinheiro devolvido com inscrição de pé é estado inconsistente)
- **HTTP** `POST /v1/bookings/:bookingId/refunds` (+2 testes de rota); `kind` no DTO de lançamento
- **UI**: bloco **Devolução** no painel da inscrição (só aparece com valor recebido) — valor pré-preenchido com o recebido, destino dinheiro/crédito com a consequência escrita ao lado, forma, data e motivo. A lista da linha virou "Lançamentos", rotulando entrada / devolução / convertido em crédito
- **Migration `20260827180000_add_payment_kind`** aplicada no Supabase (coluna + índice `(tenant_id, kind)`; reversível por `DROP COLUMN`). Advisor de segurança sem alerta novo

**Ledger do Prisma realinhado** — o `_prisma_migrations` do drk estava **6 migrations atrasado** em relação ao banco (drop_vehicle_year_color, add_post_layout, post_author_nullable, like_liker_and_comment_official, add_itinerary_photos, add_supplier_categories já estavam aplicadas, sem registro). `db:deploy` teria quebrado e `db:baseline` sozinho marcaria a payment_kind sem aplicar o DDL. Ordem usada: **aplicar só o DDL da nova** → **baseline das 7**. Agora são 24 registros e `migrate deploy` é no-op.

### Portal — Início em cards e página do roteiro ✅ (2026-08-27)

- **"Próximas expedições" virou grade de 4 colunas** (`rot-card-grid`, o mesmo do índice de roteiros): capa, nome do roteiro e data. **Saiu a ocupação** — inscritos/vagas é dado de operação, não de vitrine. Clicar abre a página do roteiro
- **`PortalItineraryScreen` nova** (só leitura, RO-01): capa grande, nome, dificuldade, descrição em `RichText` e as **saídas marcadas** para o roteiro; a inscrição segue na aba Expedições. Navegação por estado no `PortalApp`, com trilha "Portal / Início / Roteiro" e troca de aba fechando o roteiro aberto
- **`ItineraryCover` extraída** do índice do back-office para `itineraries/ItineraryCover.tsx` — a URL assinada do bucket privado é a mesma nos dois lugares, agora sem cópia. Capa ausente cai no marcador neutro
- **Sem backend novo**: a capa vem do catálogo de roteiros que o portal já carrega (`useItinerariesAdmin`), cruzada por `itineraryId` com a vitrine
- Verificado por typecheck/lint/build; **não executado como cliente** (a sessão aberta aqui é de equipe, e a agenda ficou sem saídas após a exclusão de teste)

### Portal — acabamento da página do roteiro ✅ (2026-08-27)

- **Tipografia da vitrine**: descrição em 16px/1,65 (prosa, não célula de tabela) com os títulos internos subindo junto (24/20/17 — senão o `###` ficaria menor que o parágrafo); nome do roteiro em 32px, acima do título de página padrão, por ser a manchete
- **Títulos de seção colados no conteúdo** (4px): a faixa de valores e os cards de grupo já trazem respiro próprio, então o espaço vinha dobrado
- **Escrita**: "Valor total" no modal (o card da página segue "Total estimado" — lá é projeção, aqui é a seleção feita) e "Quem vai te acompanhar nessa aventura?" na escolha da família
- **Data da saída em destaque** no modal: saiu do subtítulo discreto para um bloco com rótulo, em mono e **por extenso** — `formatDateRangeLong` (**+4 testes**) repete só o que muda ("28 a 30 de agosto de 2026", "30 de agosto a 2 de setembro de 2026", virada de ano, saída de um dia)

### Portal — orçamento da família (§3.4) ✅ (2026-08-27)

- **Card "Sua família nesta expedição"** abaixo dos valores: uma linha por pessoa com a faixa etária resolvida **na data da próxima saída** (sem saída marcada, usa hoje — e a tela diz isso) e o total pela regra casal/solo + adicionais
- **Cálculo com as funções do domínio** (`resolvePriceCategory`, `priceParticipants`, `calculateBookingTotal`), não reimplementado no front: dinheiro não pode ter duas verdades. `familyBudget` puro, **+7 testes** (base casal × solo, 3º adulto como adicional, criança que vira adulto entre duas datas, faixa de cortesia)
- **Aviso explícito** de que quem vai é escolhido na inscrição e o valor é fechado na confirmação (RO-03: o congelamento é na alocação)
- **Modal de inscrição** abre com **todos marcados** (o caso comum é a família inteira) e mostra o **valor da seleção**, recalculado a cada troca — desmarcar alguém muda a base casal/solo, então o número acompanha

### Portal — inscrição direto da página do roteiro ✅ (2026-08-27)

- O botão de cada grupo em **Próximos grupos** abre a inscrição **daquele grupo** (antes só levava para a aba Expedições). `EnrollModal` extraído de `PortalExpeditionsScreen` para arquivo próprio e usado nos dois lugares — mesmo fluxo (escolher quem da família vai, inscrição nasce pendente, cashback só ao confirmar), aberto de dois pontos
- Feedback de sucesso na própria página e a vitrine recarrega; a prop `onGoExpeditions` do detalhe saiu junto com o último uso

### Portal — valores na página do roteiro ✅ (2026-08-27)

- Bloco **Valores** entre a descrição e as saídas, lendo a tabela **vigente hoje** (`GET /v1/itineraries/:id/prices?at=`, sem backend novo)
- **As cinco categorias não são do mesmo tipo, e a tela diz isso** (§3.4): casal e solo são a **base** da inscrição (casal cobre duas pessoas, solo uma); adulto adicional e crianças são **por pessoa**, somados à base. Sem essa distinção o leitor multiplica "casal" por dois
- **Faixas etárias do próprio roteiro** nos rótulos ("6 a 10 anos", "até 5 anos", "11+ anos"), não valores fixos
- **Valor zero aparece como "cortesia"**, não "R$ 0,00" — o drk tem criança até 5 anos sem custo, e o zero fazia procurar pegadinha
- Seção **Próximos grupos** (sem botão de atalho), com o **primeiro item destacado** em **laranja sólido** (texto branco e botão invertido — fundo branco, texto accent — senão o secundário sumiria no fundo), botão de inscrição com **ícone + texto** — accent como estado de interface (o próximo), nunca como estado financeiro. Pill de dificuldade: **fácil em verde**, demais neutras
- **Cinco blocos na mesma faixa** (padrão de estatísticas do design system), não tabela
- Sem tabela vigente → **"Valores sob consulta"**, nunca um número inventado
- Conferido contra a API do drk: Coxilha Rica devolve casal 3.890,00 / solo 2.890,00 / adulto adicional 1.190,00 / criança 6–10 690,00 / criança até 5 grátis

### Texto rico — quebras de linha e o `#` por contexto ✅ (2026-08-27)

- **Parser extraído** para `richTextParser.ts` (puro, **11 testes**); o `RichText` só monta os elementos React — segue sem `dangerouslySetInnerHTML`
- **Quebra de linha preservada**: linha em branco separa parágrafos, Enter simples vira `<br>` dentro do parágrafo. Antes toda linha virava parágrafo e as vazias sumiam — o autor via um texto diferente do que digitou
- **O `#` depende do contexto**, porque os dois usos conflitam: modo `hashtags` (comunidade, padrão) mantém `#palavra` como hashtag; modo `headings` (descrição do roteiro) lê `#`/`##`/`###` como títulos e não destaca hashtag. Sem espaço depois do `#` não é título — é texto
- **O editor acompanha o modo**: na descrição do roteiro o botão vira **H** e prefixa a linha com `## ` (com o espaço que o título exige); na comunidade segue o `#` colado na palavra. Escrever e ver passaram a bater
- `.rt-h1/2/3` em mono, como todo título do sistema. Renomeado `richText.ts` → `richTextParser.ts`: no Windows o nome colidia com `RichText.tsx` só pela caixa

### Roteiros — 20 fotos e remoção que apaga o arquivo ✅ (2026-08-27)

- **Limite 10 → 20** em todas as camadas: regra (`setItineraryPhotos`), borda (`photosBody.max(20)`) e galeria de edição. Testes atualizados (uso: aceita 20, recusa a 21ª; rota: 200 com 20, 400 com 21)
- **Remover foto apaga o arquivo do Storage** (`removeImages`: a cheia e a miniatura). Acontece **depois** de o servidor aceitar a nova galeria — apagar antes deixaria foto quebrada se o save falhasse — e a falha ao apagar não derruba o save (arquivo órfão é ruído, não erro de negócio). A tela guarda o conjunto salvo para saber o que saiu; a policy de DELETE do bucket é escopada por tenant
- **Carga da galeria ajustada ao novo limite**: pré-carga das **6 primeiras** fotos cheias (20 × ~400 KB seriam ~8 MB para quem talvez veja três); as demais carregam **ao apontar ou clicar**, com a miniatura em cache aparecendo na hora enquanto a cheia chega

### Portal — galeria e descrição do roteiro ✅ (2026-08-27)

- **`ItineraryGallery`**: destaque em **5:4** com as demais fotos em **miniaturas 1:1 ao lado**, num grid que **fecha exatamente na altura do destaque** — a linha é uma fração de `--gal-h` e o quadrado 1:1 define a largura, então as miniaturas se redimensionam sozinhas e não há sobra nem rolagem vertical; muitas fotos crescem em colunas (no modal e no mobile empilha, com faixa horizontal). Clicar troca o destaque. Substitui o `ItineraryCover` na página/modal do roteiro; os cards da grade seguem com a capa
- **Troca instantânea** — o lag era medido: **432 ms** para assinar a URL a cada clique + **1,26 s** para baixar a foto cheia (~1,7 s por clique, medido na sessão do drk). Agora **todas as URLs (cheias e miniaturas) são assinadas numa ida só** (`signedUrlsFor`, 20 paths em **194 ms**), as cheias entram em **pré-carga** e, enquanto uma não terminou, o destaque mostra a miniatura já em cache e ganha nitidez ao chegar
- **Destaque agora usa a imagem cheia** (2560px) e só a miniatura usa o `_thumb` (480px) — antes o hero ampliava um thumbnail ~2,6× e saía borrado
- **Descrição** renderizada em `RichText`; sem texto cadastrado, a tela **diz isso** em vez de sumir sem explicação
- `useItineraryPhotos` (`GET /v1/itineraries/:id/photos`, já existente e legível pelo cliente): capa primeiro, resto por posição; falha de leitura não quebra a tela, só esconde a galeria
- Conferido contra o banco/API do drk: Coxilha Rica tem **10 fotos (10 cheias + 10 thumbs no bucket), 1 capa** e descrição em markdown — o caminho de dados está completo. Render no portal ainda **não visto como cliente**

### Portal — Expedições em cards ✅ (2026-08-27)

- A aba **Expedições** virou a mesma grade de 4 colunas do Início: capa, nome do roteiro e datas. **Capa e nome abrem o roteiro num modal**; o botão **Inscrever-se** fica no rodapé do card (botão dentro de botão é inválido, então o card é `<article>` com dois filhos clicáveis — `.rot-card-open` + `.rot-card-foot`)
- **Saiu a contagem de inscritos**; sobrou "lotada" quando não há vaga, porque é o que desabilita a inscrição
- **`useItineraryCovers`** (terceiro uso do mesmo cruzamento vitrine→catálogo, aí generalizou): Início e Expedições usam o hook; a agenda segue com o catálogo por causa do filtro por roteiro

### Portal — agenda completa no menu ✅ (2026-08-27)

- **Calendário extraído** para `agenda/calendar.tsx` (mês, semana, lista, layout de barras por semana e helpers de data), com um tipo `CalendarEvent` que não sabe de onde vêm os eventos. A `AgendaScreen` do back-office passou a alimentá-lo (mapeando `ScheduleEventDto`, com ocupação AG-06) — **mesma tela de antes**, provada ao vivo depois da refatoração: barra do evento no mês, dia de hoje em `--o`, filtro por roteiro e clique abrindo a mesa
- **`PortalAgendaScreen` nova**: o mesmo calendário, **sem nenhum controle de edição** (não cria, não edita, não abre a mesa) e sem ocupação — número de inscritos é dado de operação. Navegação de mês, "Hoje" e filtro por roteiro ficam. Cinco estados
- **Fonte é a vitrine** (`/v1/portal/expeditions`: `open` + `public`), **não** a agenda interna: grupo privado fica fora do portal por AG-07, e rascunho/cancelada não são vitrine. Sem backend novo
- **Clique abre a página do roteiro** (decisão do dono do produto: sem modal). `PortalItineraryDetail` é o conteúdo puro — capa/galeria, nome, dificuldade, descrição, valores e próximos grupos — e a `PortalItineraryScreen` põe a casca. Agenda, Expedições e Início navegam pelo mesmo `onOpenItinerary`; o modo compacto e o CSS do modal saíram junto
- Entrada **Agenda** na nav do portal (2ª posição, ícone que já existia)

### Portal — aba Roteiros removida ✅ (2026-08-28)

- A aba **Expedições** (grade de cards com capa → página do roteiro) já cumpria a função; a lista antiga de Roteiros era leitura sem foto e sem clique. Saíram a tela, a entrada do menu, o atalho "Ver roteiros" do Início e o CSS que só ela usava
- O botão restante no Início virou **"Ver todas as expedições"** (antes eram dois atalhos)

### Portal — cartão da próxima aventura em duas colunas ✅ (2026-08-28)

- **"A receber" virou "A pagar"**: quem lê o cartão é o cliente. O mesmo número tem dois nomes conforme a audiência, e usar o do back-office no portal invertia o papel de quem deve
- Coluna da esquerda o roteiro (status, nome, datas, participantes), coluna da direita o dinheiro: **valor total, valor pago e a pagar**. No desktop o cartão tinha metade da largura vazia; no celular as colunas empilham
- Pago em verde (`--go`), os outros dois em tinta neutra — cor é dado, e só o que já entrou é fato consumado
- **"Falar com a equipe"** no canto inferior direito, verde WhatsApp, sem sublinhado, alinhado por baixo com a linha dos participantes. Abre `wa.me` com o número do tenant e a mensagem já escrita, citando o grupo
- Badge de status encolhida para o tamanho do texto — pill de largura fixa num texto curto vira faixa
- **Minha conta**: o formulário de veículo abre com o carro da família já preenchido. Campo vazio sobre dado existente convida a redigitar o que já está lá

### Inscrições: um funil só, com revisão da equipe ✅ (2026-08-28)

**Decisão do dono do produto:** toda inscrição — do site **ou do app** — entra na fila de não processadas; a equipe revisa e, num passo só, aprova alocando no grupo.

- **`requestSelfEnrollment`** substitui `selfEnrollBooking` (TDD, 5 testes): o pedido do portal vira item da fila com os **ids já escolhidos** (payload `portal_enrollment`: grupo, head, participantes) e o resumo no mesmo formato dos itens do site — a equipe lê tudo do mesmo jeito, sem uma segunda tela de revisão. Rota devolve `{ intakeId, status: 'pending_review' }`
- **`allocateFromQueue` reconhece o pedido do app** (+1 teste): não recria cliente nem casa por CPF, e **preserva a origem `portal`** — é ela que mantém o cashback (CB-09). Formulário do site segue como `webhook` (sem cashback)
- **`listRecentBookings`** (TDD, 3 testes) + `GET /v1/bookings/recent`: as últimas inscrições de qualquer origem, com responsável, saída, origem, pessoas e contratado derivado. Port `listRecent` (fake/dev/prisma)
- **Tela "Inscrições" com dois blocos**: **Não processadas** (a fila, cartões com decisão própria) e **Últimas inscrições** (tabela — linhas homogêneas que se comparam), com a origem legível (app / site / equipe) e ao vivo
- **Portal**: `listEnrollmentRequests` + `GET /v1/portal/enrollment-requests` e aviso no Início — **"seu pedido está em análise"**. Sem isso o cliente pediria e não veria nada, já que a inscrição só existe depois da alocação. Busca no servidor (`intake_events` é tabela de operação; a RLS não abre nada dela para o cliente) e escopo de família pelo head
- **Efeito colateral a saber**: a inscrição do portal deixou de ser imediata. O cliente não ocupa vaga nem gera cashback até a equipe aprovar — na prática pouco muda, porque vaga só é ocupada por inscrição confirmada e confirmação exige pagamento

### Audiência do catálogo de roteiros — SEC-01 ✅ (2026-09-01)

Nenhum dos sete casos de uso de roteiro tinha guarda de papel, e `GET /v1/itineraries` e `GET /:id/photos` liam o repositório **direto**, sem passar por caso de uso — não havia sequer onde pôr a guarda. Como o servidor fala com o banco por um role com `BYPASSRLS`, a policy do Postgres não protege essa via.

Um token de cliente criava roteiro, editava qualquer um, trocava as fotos e lia o catálogo inteiro com a tabela de preços. A apresentação do portal buscava `GET /v1/itineraries` e achava o roteiro certo com um `.find()` **no navegador** — filtro de audiência no cliente não é filtro, o dado já saiu.

- **Escrita e histórico de preço**: equipe. **Leitura do cliente**: só a vitrine (`active` + `catalog`)
- **`listItineraries` e `listItineraryPhotos`** nasceram aqui, porque as rotas não tinham caso de uso nenhum onde a guarda coubesse
- **Preço vigente o cliente lê**, mas só o da vitrine: a apresentação do roteiro mostra preço
- **Fora da vitrine responde 404, não 403** — 403 confirmaria que a saída fechada existe, e ela é justamente a que ninguém de fora deve saber que existe
- **Teste em duas camadas**: a aplicação prova a guarda, a rota prova que a rota passa por ela. **A segunda é a que pegaria este defeito** — guarda no caso de uso não vale nada se a rota ler o repositório direto

### Teste não passava pelo typecheck — achado, medido, não fechado ⏳ (2026-09-01)

O `tsconfig.json` de cada pacote comanda o build (`outDir: dist`) e por isso exclui `*.test.ts` — teste não vai para o `dist`. O efeito colateral nunca tinha sido notado: **nenhum dos ~1.300 testes passava pelo typecheck**. Erro de tipo em teste só aparecia rodando, no CI, depois do push.

Foi assim que uma `string` entrou onde o tipo pedia `LocalDate` (que é `{ year, month, day }`): compilou, passou no lint, e quebrou no CI com `PrismaClientValidationError` sem mensagem.

**Feito**: `tsconfig.test.json` em `domain`, `application`, `infrastructure` e `server` — mesmo projeto, sem emitir nada, com os testes incluídos. Roda por `pnpm typecheck:tests`.

**Não feito, de propósito**: ligar no CI. O comando acusa **44 erros em 28 arquivos**, e a maioria é fixture faltando campo (`checkedInAt` em nove `BookingRecord`), `any` implícito e atribuição a propriedade `readonly`. Corrigir isso às pressas é como um teste passa a compilar e para de testar — merece uma passada própria, arquivo por arquivo, não um remendo no fim de outra tarefa.

Enquanto não for ligado, `typecheck:tests` é a fotografia da dívida: rode e veja.

### Guardas de papel: o levantamento, fechado ✅ (2026-09-01)

Foi a **segunda vez na mesma sessão** que apareceu caso de uso sem guarda (fornecedores, depois roteiros). Varrendo `packages/application`, **29 casos de uso não têm guarda explícita**. Boa parte é legítima — o cliente deve curtir post, salvar veículo, ver expedições abertas. Mas conferindo rota e caso de uso um a um, estes **não checam audiência em lugar nenhum**:

| Caso de uso | O que um token de cliente alcança |
|---|---|
| `searchCustomers` | busca na base inteira de clientes: nome, CPF, contato |
| `getGroupBoard` | a mesa da saída: contratado e pago de **todas** as famílias |
| `mergeCustomers`, `moveToResponsible`, `promoteToResponsible` | cirurgia de família em qualquer cliente |
| `createScheduleEvent`, `updateScheduleEvent`, `deleteScheduleEvent` | criar e apagar saídas na agenda |
| `updatePaymentFees`, `disconnectPaymentProvider` | configuração do gateway de pagamento |

Todos fechados. O padrão do defeito era sempre o mesmo: **os três helpers de guarda estavam em três pastas diferentes** — `communications`, `community`, `itineraries` —, então quem escrevia caso de uso novo não achava nenhum e não punha guarda. Agora vivem em `audience.ts`, com a regra do produto escrita na doc do arquivo e provada em `audience.test.ts`.

- **`denyCustomer`, não `requireTeam`**: `integration` (webhook do site) e `system` (job interno) seguem passando, porque agem por conta do tenant. A regra do dono é sobre o cliente
- **`registerCompanion` e `saveVehicle` ficam sem guarda de propósito**: o portal chega neles por invólucros que escopam à própria família. Tentei guardá-los e a suíte quebrou na hora, com PC-06 e PC-08 — a guarda deles é na rota de back-office
- **Ainda falta**: não existe apagar comentário na comunidade (o post tem, escopado ao autor). É funcionalidade faltando, não brecha

### A armadilha da subconsulta em policy — RO-01 ✅ (2026-09-01)

A primeira execução dos testes de RLS pegou uma policy que **não fazia o que estava escrita nela**. A galeria de fotos dizia "foto de roteiro ativo do tenant":

```sql
AND EXISTS (SELECT 1 FROM itineraries i
            WHERE i.id = itinerary_photos.itinerary_id AND i.status = 'active')
```

Só que **a subconsulta também passa pela RLS**. A policy de `itineraries` escopa o cliente aos roteiros que ele contratou, então o `EXISTS` dava falso e a galeria vinha vazia para quem ainda não viajou. E o modo de falhar é o pior possível: RLS **não levanta erro**, só devolve menos linhas — a tela fica vazia e nada indica por quê.

- **É a mesma classe de erro do `data` do Prisma** que perdeu a chave PIX: o código diz uma coisa, o sistema faz outra, e nenhum mecanismo grita. Os dois só apareceram quando algo executou de verdade contra Postgres
- **Correção**: `app.active_itinerary_ids()`, `SECURITY DEFINER` com `search_path` fixo, no molde de `app.current_family_ids()` que já existia. **Toda checagem de policy que atravessa outra tabela precisa desse tratamento** — senão herda o escopo da tabela atravessada, em silêncio
- **Decisão do dono**: a galeria é catálogo, não contexto da viagem. Foto de roteiro publicado é material de venda — não é margem, não é fornecedor, não é dado de outra família
- **A cerca**: teste novo crava que abrir a foto **não** abriu o roteiro — `itineraries` e `itinerary_prices` seguem invisíveis para o cliente. Sem ele, uma mudança futura na função poderia alargar o acesso sem nada ficar vermelho
- Migration `gallery_is_catalog` aplicada no drk — **37 migrations**, `check:rls` com 38 tabelas

### O buraco do Prisma, o primeiro push e o CI ✅ (2026-09-01)

A chave PIX (FO-07) salvou `NULL` em produção com **1.181 testes verdes**. O repositório Prisma **lia** a coluna e nunca a **escrevia**: o `data` é lista branca escrita à mão, e campo esquecido ali não é erro de compilação nem de execução — o `PATCH` respondeu `200`, o formulário fechou, o banco ficou vazio.

**Por que nada pegou.** Os testes de rota rodam sobre repositórios de memória, e o repositório Prisma de fornecedor não tinha teste algum. A suíte provava caso de uso e rota, e não dizia nada sobre o campo chegar ao Postgres.

**Auditoria.** Varri os **69 pontos de escrita** dos 18 repositórios Prisma, comparando campos do port com chaves gravadas. Sete apontamentos, todos falsos positivos conferidos um a um (campo em `where`, `Address` achatado em colunas, participantes gravados em transação à parte). **A chave PIX era o único campo realmente ausente.**

**Guarda de compilação.** `satisfies Record<keyof Port, unknown>` nos cinco pontos de escrita do arquivo de fornecedores: obriga a citar toda chave do port **sem alterar o tipo do literal**, então o Prisma segue conferindo cada valor. Provado removendo `pixKey` de propósito — `error TS1360`. Não foi aplicado nos outros 17 repositórios de propósito: onde há achatamento ou escrita aninhada, o guarda daria erro falso e a ferramenta certa é o teste de ida e volta.

**O que o primeiro push revelou.** O projeto não tinha **nenhum commit** e o CI — que já estava escrito, com serviço `postgres:17` — **nunca havia executado**. Os 62 testes de integração e RLS não estavam apenas sem rodar nesta máquina: nunca rodaram em lugar nenhum. A primeira execução expôs sete seeds defasados, corrigidos em seguida:

- `itineraries.slug` virou obrigatória depois de quatro seeds terem sido escritos
- `post_likes.customer_id` foi renomeada para `liker_id`
- `payment_charges.environment` é obrigatória — sem ela, o teste do unique de cobrança duplicada era recusado por `NOT NULL` e **passava pelo motivo errado**

Escrevi dois verificadores para achar tudo de uma vez em vez de descobrir de push em push: um compara os `INSERT` dos seeds com as colunas obrigatórias do schema, outro procura colunas citadas que não existem mais.

**Dado pessoal fora do repositório.** O repositório é público. O CPF e o telefone reais do dono apareciam em **49 arquivos** como fixture, inclusive no `prd.md` e no `status.md`. Trocados por `900.000.100-57` e `48999998877` em 196 ocorrências **antes do primeiro commit** — o histórico nasceu limpo. `examples/` (roomlist e planilha da seguradora, com nomes reais) entrou no `.gitignore`.

**Teste de integração de fornecedor**: cria, **relê do banco** e confere campo a campo; a chave sobrevive à edição; chave em branco limpa chave e tipo juntos; categoria renomeada alcança o histórico. Ida e volta pega o que teste de payload não pega.

### Chave PIX do fornecedor — FO-07 ✅ (2026-08-31)

Faltava o dado que a equipe mais usa do fornecedor: para onde mandar o dinheiro. Estava em bloco de notas, WhatsApp ou na cabeça de alguém.

- **Sem seletor de tipo.** O tipo (CPF, CNPJ, e-mail, celular ou aleatória) **sai da própria chave**, reconhecido no domínio. Quem cadastra cola o que o fornecedor mandou; classificar isso é trabalho de computador, e seletor errado guarda tipo mentindo sobre a chave
- **A ambiguidade dos 11 dígitos** é a parte difícil: `11987654321` é celular e `52998224725` é CPF, e ambos têm 11 dígitos. A ordem é tentar CPF pelos **dígitos verificadores** primeiro e cair para telefone. Não bastou `parsePhone`, que só olha o tamanho: `00000000000` passava como "telefone" — entrou `temCaraDeTelefone`, que exige DDD entre 11 e 99 e celular começando em 9
- **Guardada normalizada** (dígitos, E.164 ou caixa baixa), **devolvida formatada e inteira**. Chave mascarada é chave inútil: ela existe para ser copiada no app do banco, e a área de fornecedor é só da equipe (SEC-01)
- **Chave e tipo se limpam juntos.** Chave em branco zera os dois — tipo sem chave seria estado impossível guardado no banco
- **Chave inválida para na borda** com `422 invalid_pix_key`, mapeada como `InvalidCpfError` e `InvalidPhoneError` já eram. O primeiro teste vermelho pegou exatamente isso: sem o mapa, a rota devolvia `500`
- Migration `add_supplier_pix` (duas colunas nulas) **aplicada no drk** — 36 migrations
- **Estado**: suíte em **1.181 unit verdes**

### Excluir gasto — GR-18 ✅ (2026-08-31)

Faltava desde sempre: dava para lançar gasto e nunca para tirar. Apareceu porque eu não quis lançar um gasto de teste no drk para conferir o relatório na tela — não havia como remover depois.

- **Exclusão lógica.** O `deleted_at` já existia na tabela e **as leituras já o filtravam** desde o começo; só faltava quem o marcasse. Lançamento financeiro não se apaga (`CLAUDE.md`)
- **Gasto com pagamento é recusado** (`expense_has_payments`). `listPaymentsByGroup` casa pagamento com o **grupo**, não com o gasto vivo: apagar o gasto deixaria o pago contando como "pago aos fornecedores" sem contratado por trás, e a margem do grupo sairia errada sem nada na tela dizendo por quê. Quem pagou errado acerta com o fornecedor
- **O botão só aparece enquanto nada foi pago** — botão que existe para dar erro é pior que botão que não existe. Se o servidor recusar mesmo assim (corrida entre duas abas), a frase diz o que fazer
- Owner/admin, como excluir recebimento (IN-09). Trilha `supplier_expense.delete` guardando quanto era e de quem: gasto que some sem deixar o valor é pior que gasto que fica
- **Os fakes passaram a filtrar o excluído** nas três leituras, como o Prisma já fazia — senão o teste de "some da tabela" passaria sem o comportamento existir
- **Serviu na hora**: lancei R$ 1.200,00 de Pernoite na Fazenda do Barreiro (Hospedagem), vi o fechamento por saída e o por-categoria mostrarem **1.200,00 nos dois**, e apaguei. O grupo voltou a 0,00 de gastos e 100% de margem
- **Estado**: suíte em **1.155 unit verdes**

### Gastos por categoria: catálogo completo e relatório — FO-05 · FO-06 ✅ (2026-08-31)

O dono pediu para "criar categorias para os gastos e cadastrar a categoria do fornecedor, pra metrificar depois". **Metade já existia e ninguém lembrava**: o FO-04 entregou a tabela `supplier_categories` com RLS, o `category_id` no fornecedor, o seletor com "+ Nova categoria…" e a coluna no índice, em 2026-08-27. O que faltava era o que dava uso àquilo — renomear, excluir, e o relatório, que nunca existiu.

**A decisão que estrutura tudo: a categoria é do fornecedor, não do gasto.** O gasto herda na leitura, então recategorizar um fornecedor reclassifica o histórico dele inteiro. É o oposto do preço da inscrição (§3.4), congelado — e a diferença é o que cada número significa: o unitário **é** o contrato com o cliente; a categoria é a gaveta em que a casa guarda o gasto para se olhar. Quando alguém arruma o cadastro, quer o relatório certo desde o começo.

**FO-05 — gerência do catálogo**, na tela de Fornecedores e não em Configurações: quem cadastra fornecedor é quem percebe que falta categoria.

- **Renomear exige owner/admin** porque alcança o passado; **criar é de qualquer equipe**, porque o "+ Nova categoria…" é o mesmo gesto de quem cadastra o fornecedor. Pedir owner para o rótulo e aceitar operator para o fornecedor que o carrega seria rigor no lugar errado
- **Excluir é bloqueado enquanto houver fornecedor na categoria** (`category_in_use`, dizendo quantos). A FK é `ON DELETE SET NULL`: sem a trava, excluir desvincularia os fornecedores em silêncio e o histórico do relatório mudaria sem ninguém ter decidido. Reescrever o passado é aceitável quando se **escolhe** (renomear, recategorizar), nunca como efeito colateral de um "Excluir". Não virou exclusão lógica porque a tabela não tem `deleted_at` e, com a trava, só se exclui categoria sem uso — aí não há histórico a preservar
- Sem migration: a de 2026-08-27 já servia

**FO-06 — o relatório**: contratado, pago e em aberto por categoria, ordenado do maior gasto para o menor, com "Sem categoria" sempre por último — é lembrete de cadastro por fazer, não categoria disputando o topo. Gasto de fornecedor apagado também cai ali, em vez de sumir.

- **A janela é a mesma do fechamento por saída** (data de início da saída + roteiro), por decisão do dono, para que os dois somem **o mesmo total de gastos** e possam ser lidos na mesma página. Para isso o `matchesFilter` saiu de dentro do relatório financeiro e virou `reports/reportWindow.ts` compartilhado: duas cópias da mesma regra divergem no primeiro ajuste, e o teste de reconciliação quebraria sem dizer por quê
- **A reconciliação é teste, nas duas camadas**: no caso de uso e na rota, comparando `totals.contractedCents` com o `expenseCents` do relatório financeiro no mesmo filtro
- **Sem N+1**: uma leitura de `listSuppliers` fora do laço vira `Map<supplierId, categoria>`
- `apps/server/src/routes/reports.test.ts` **nasceu aqui** — a rota do relatório financeiro nunca tinha teste de rota

**Buraco de acesso fechado, fora do pedido (SEC-01 · A01).** Ao mapear, apareceu que **7 dos 9 casos de uso de fornecedor não tinham guarda de papel**: um JWT `role: customer` lia a **margem do grupo** (`/v1/groups/:id/result`) e os **gastos com fornecedores**, além de poder cadastrar fornecedor e lançar gasto. O PRD proíbe isso em dois lugares. A RLS da tabela é só-equipe, mas **não protege esta via** — o role do Prisma tem `BYPASSRLS` e a Client Extension injeta só `tenantId`, nunca audiência. Seis testes vermelhos antes do fix.

**Defeito no fake, do tipo que só aparece em produção.** `supplierRepository.fake.ts` e `inMemorySuppliers.ts` gravavam `categoryName` **na escrita**; o Prisma resolve por junção **na leitura**. Depois de renomear, os dois discordariam — e o teste de renomear passaria por acidente. Os fakes passaram a resolver na leitura, como o banco faz. Foi o primeiro passo do trabalho, antes de qualquer teste de rename.

- **A 11ª cópia do formatador de dinheiro** saiu junto: `RelatoriosScreen.tsx` tinha a sua, e agora usa `ui/money.ts`. Sobram as de `customers/` e `itineraries/`
- **PRD atualizado**: §4 ganhou `supplier_categories` e o `category_id`; §5.2 ganhou FO-04 (documentando o que já existia), FO-05 e FO-06, com a regra da categoria-do-fornecedor escrita por extenso
- **Provado no drk**: categorias criadas, marcada no fornecedor, exclusão de categoria em uso recusada com a frase certa, e o relatório concordando com o fechamento. **Não lancei gasto de teste** — não existe rota para excluir gasto, e ele ficaria no histórico do dono; a reconciliação está coberta por teste nas duas camadas
- **Estado**: suíte em **1.143 unit verdes**; typecheck, lint, `check:markers` e prettier limpos

### A linha da mesa virou barra de abas — painel da inscrição ✅ (2026-08-31)

O painel falava duas línguas: as ações de dinheiro eram botões que abriam modal, e o resto — devolução, ajuste de valor, termo, movimentações — eram blocos empilhados que cresciam para baixo. O painel esticava, e o que se procurava ficava no fim.

Passou por **modal** no caminho e não ficou: modal cobre a mesa, e quase toda ação daqui é lida **contra os números da linha** — "cobrar quanto?" se responde olhando o a receber, "devolver de quê?" olhando o recebido. Cobrir isso para perguntar é esconder a resposta.

O que ficou é **fileira de botões que troca o que aparece embaixo**: uma gaveta por vez, o botão aceso marcando qual, e clicar no aceso fecha. Ordem definida pelo dono: **Pessoas · Movimentações · Lançar recebimento · Emitir cobrança · Registrar devolução · Ajustar valor · Ver termo aceito · Emitir nota fiscal · Cancelar inscrição**, com as condicionais (restaurar preço, confirmar, desfazer check-in) no meio quando cabem.

- **Quem viaja na inscrição** (GR-07, 2 testes) é a primeira aba e **abre por padrão**: expandir a linha é perguntar "quem é essa família?", e a gaveta já responde. Nome, papel, categoria de preço e unitário de cada um — a **categoria aparece porque é ela que explica o valor**: sem "criança maior", os 690,00 ao lado de 2.890,00 parecem arbitrários. `GroupBoardRowParticipant` ganhou `fullName`, resolvido no servidor no mesmo mapa que já trazia o nome do responsável (não vira N+1); participante fora do cadastro sai como `—` em vez de quebrar a linha
- **Lançar recebimento e emitir cobrança levam para Movimentações ao concluir**: o lançamento acabou de virar linha do extrato, e é lá que se confere
- **Nenhum componente novo de design system.** O aceso reusa `.btn.is-active`, que já existia para o segmentado, com `--o` — seleção é estado de **interface**, não dado financeiro (§1). Todos os botões da fileira são iguais: um primário sólido competiria com o aceso, dois laranjas dizendo coisas diferentes na mesma linha. Só "Cancelar inscrição" tem tratamento próprio, e ali o vermelho é dado (§1: vermelho = cancelado)
- **Gavetas padronizadas**: `drawer-title` (mono 13px) e `drawer-sub`, rodapé sempre igual — secundário "Cancelar" à esquerda, ação à direita, mesmo tamanho. O confirmar da devolução era `btn-danger` e virou primário, como o design system manda (§5: no destrutivo a cor não muda, o **verbo** carrega a intenção)
- **"Confirmar sem pagamento" virou só "Confirmar"**, e o aviso mudou de lugar: o botão é neutro e a gaveta é que diz o que está em jogo. Sem recebimento, o aviso é cinza — confirmar sem pagamento não é erro nem sucesso financeiro, é exceção, e exceção se registra, não se pinta de vermelho (§6). Com recebimento — anomalia, porque o primeiro pagamento confirma sozinho (IN-08) — mostra quanto já entrou. O motivo segue obrigatório nos dois casos (IN-10)
- **Os controles perderam o gatilho e o estado `open` próprios**: quem decide o que está aberto é o painel, e cada um virou corpo puro com `onClose`. Antes cada um sabia abrir a si mesmo, o que era incompatível com "uma por vez"
- **Inscrição cancelada perde as ações mas não Pessoas, Movimentações e Termo**: quem estava na inscrição, o que entrou de dinheiro e o que foi combinado continuam sendo perguntas — e é justamente depois do cancelamento que alguém as faz
- **`AcceptedTermView` é o mesmo componente da ficha do cliente**, não uma cópia: ganhou `autoLoad` e `onClose`, que significa "o contêiner é dono do fechar"

**Três defeitos de moldura, todos o mesmo erro.** Movimentações, `PeopleList` e `PaymentControl` traziam o próprio contêiner; ao entrarem na gaveta, viraram caixa dentro de caixa — título repetido nos dois primeiros, e no terceiro duas margens e dois filetes que desalinhavam o conteúdo. **Componente que traz a própria moldura quebra no dia em que alguém o coloca dentro de outra coisa**; a moldura é de quem posiciona.

**Dois defeitos que só a tela mostrou:**

- O **"Fechar" do termo** só existia no estado carregado. Nos estados *sem termo* e *erro* — que não têm cabeçalho onde pendurá-lo — não havia saída. Foi para o rodapé, onde existe nos quatro estados
- Os **nomes dos participantes vinham vazios**, com o `getGroupBoard` certo e os testes verdes: o servidor rodava o `dist` antigo. **Mexer em `packages/` e conferir pela tela exige `build` e reiniciar o servidor**

**O formatador de dinheiro tinha dez cópias no web**, uma por tela, e foi assim que duas divergiram: a do extrato perdeu as contrabarras do regex de agrupamento (`B(?=(d{3})+(?!d))`) e **nada agrupava** — `2392,47` embaixo de `3.580,00` na mesma tabela —, e a da devolução usava `toFixed` e também não agrupava. Agora há uma, `apps/web/src/ui/money.ts`, com 7 testes, incluindo o caso quebrado. As sete cópias de `group/` foram substituídas; **sobram as de `customers/` e `itineraries/`**, corretas mas duplicadas, e valem a mesma limpeza. A perda de contrabarra é a mesma falha do regex de data do CF-05, no começo do dia: acontece ao escrever arquivo por script, e o teste é o que a pega.

**Não vistos na tela**: "Confirmar" e "Desfazer check-in" dependem de condição que os dados do drk não têm hoje — inscrição pendente e janela de embarque aberta (o check-in só libera entre as datas da saída, e a de outubro não chegou). O que os esconde é uma linha de guarda em cada.

Saíram do CSS, por ficarem sem uso: `.rowpanel-grid`, `.rowpanel-override` e `.discount-row`.

### O desconto de balcão passou a falar em total — GR-04 revisto ✅ (2026-08-31)

O controle existia e o dono não achou. Três motivos, os três de projeto: o botão se chamava **"Sobrepor valor (GR-04)"** — vocabulário do código, com id de requisito vazando para a tela —, vivia no fim de um painel longo, e pedia **valor por participante**. Para dar 10% era preciso calcular 2.890 → 2.601 e 690 → 621 na mão. O sistema sabe fazer essa conta e estava deixando ela com o operador.

Agora é **"Ajustar valor"**: um campo, um alternador **% / R$**, o motivo obrigatório de sempre e a prévia *de quanto para quanto* antes de aplicar.

- **Domínio novo, 13 testes** (`distributeDiscount.ts`): rateia o desconto do total entre os participantes proporcionalmente ao que cada um vale. A obrigação inegociável é a soma bater **exata** — rateio proporcional quase nunca dá inteiro em centavos, então cada parte arredonda para baixo e os centavos restantes vão pelo método da maior fração, com empate resolvido pela ordem. Sem isso, 33% de R$ 3.580,00 fecharia um centavo abaixo do combinado e a inscrição ficaria eternamente a um passo de quitar. `discountFromPercent` arredonda o desconto para baixo pelo mesmo motivo do cupom (CP-04): o centavo da dúvida fica com a casa, nunca vira desconto maior que o negociado
- **Caso de uso novo, 15 testes** (`discountBookingTotal.ts`), substituindo `overrideBookingPrices`: valida, rateia pelo domínio e grava o motivo em cada linha tocada, com a origem virando `override`. A rota `POST /v1/bookings/:id/price-overrides` virou `POST /v1/bookings/:id/discount`
- **Duas travas que o override antigo não tinha.** A primeira é de alçada: desconto agora exige **owner ou admin**, como o cupom (CP-06) e a confirmação manual (IN-10) — o override aceitava qualquer membro de equipe, inclusive viewer, o que era um buraco. A segunda é a do cupom (CP-07): descontar abaixo do que já entrou produziria saldo negativo, que o sistema leria como "a empresa deve"; devolução é outro caminho (§3.6)
- **A trilha responde "quem baixou o valor desta inscrição"** seis meses depois: `booking.discount` com modo, valor pedido, desconto em centavos, de quanto para quanto e o motivo. Sem dado pessoal
- **O que se perdeu, de propósito**: override por participante. Cortesia só para a criança, por exemplo, agora se expressa como o desconto equivalente no total. Foi decisão do dono — "ajustar somente o valor total". O caminho de **subir** o valor também saiu: o ajuste só abate, e o desfazer é o botão de restaurar preço de tabela, logo abaixo
- **Provado no drk**: 10% sobre a inscrição de R$ 3.580,00 → contratado R$ 3.222,00, a receber R$ 1.722,00, receita e margem re-derivadas na mesma leitura

**"Restaurar preço de tabela"** (mesmo dia, fechando o ajuste): o botão vizinho, que só aparece quando a linha tem preço ajustado à mão.

- **Existe porque o ajuste só abate.** Sem a volta, um número digitado errado deixaria a inscrição valendo menos para sempre — e foi o que aconteceu na primeira vez que usei a tela, num teste no drk
- **Restaurar não é "subir o valor à vontade"**, e é isso que a torna segura: recalcula o que a tabela do roteiro diz para **esta saída**, pelo mesmo caminho da alocação. A versão de preço resolve pela **data de início do grupo** (§3.4), então reajuste posterior do roteiro não entra na conta: quem restaura hoje chega ao mesmo número do dia da alocação. A categoria também volta pela idade na data de início
- **Método próprio no port** (`restoreParticipantTablePrices`), não um `applyParticipantOverrides` com outro argumento: aqui a categoria também muda e o par origem/motivo é o oposto do override. Um setter genérico esconderia que são movimentos contrários
- **A mesa passou a dizer se a linha foi ajustada** (`priceAdjusted`), e é isso que decide se o botão aparece. Vem do servidor porque varrer participante atrás de `priceSource` seria regra de negócio em componente
- **Recusa quando não há o que restaurar** (`nothing_to_restore`) e em grupo de preço manual, que nunca teve tabela para voltar
- **8 testes de caso de uso + 2 de rota + 2 da marcação na mesa.** Provado no drk: os 10% de teste desfeitos, inscrição de volta a R$ 3.580,00
- **Continua sem existir**: subir o valor acima da tabela. Se um dia a permuta acima do preço aparecer, é feature nova — e aí a conversa é outra


### O cupom é do cliente, não do balcão — CP-05 revisto ✅ (2026-08-31)

Ajuste de rumo do dono do produto, uma sessão depois de os cupons entrarem: **a equipe não aplica cupom.** O cupom existe para o cliente que se inscreve e paga sozinho — a casa gera o código em Promoções, entrega ao cliente, e ele digita no ato do pagamento; o sistema recalcula e emite a cobrança no ASAAS já com o desconto.

- **Por que o admin não precisa de cupom**: emitindo cobrança pelo back-office, ele já digita o valor que quer receber. Duas portas para a mesma coisa é uma delas usada errado
- **Mas cobrar menos não é dar desconto.** Emitir cobrança de R$ 3.501 numa inscrição de R$ 3.890 deixa R$ 389 "a receber" para sempre, inflando o total do grupo: o contratado não cai por se cobrar menos. O caminho do desconto de balcão é o **override de preço** (GR-04), que baixa o contratado com motivo registrado. A divisão ficou explícita: **override = desconto que a casa dá; cupom = desconto que o cliente resgata**
- **Defeito achado no caminho, corrigido com teste vermelho antes**: o `dueOf` do `createBookingCharge` somava os unitários crus e **ignorava o desconto** — inscrição com cupom gerava cobrança pelo valor cheio, exatamente o que quebraria o fluxo do cliente. Agora lê `bookingContracted`, o mesmo número que a mesa e o cashback leem. Dois testes novos: a cobrança sai pelo contratado, e cortesia integral não vira cobrança de zero
- **Removido**: `CouponControl` virou bloco **só leitura** (código e abatimento, sem formulário), e as rotas `POST`/`DELETE /v1/bookings/:id/coupon` saíram junto com `couponCall`/`couponMessageFor` do front. Um teste de rota fixa a decisão — as duas respondem 404 —, porque enquanto o fluxo do cliente não chega é fácil alguém "devolver" a rota achando que faltou
- **A exibição ficou porque o número precisa de causa**: sem o bloco, a linha aparece valendo menos que a tabela e nada explica por quê. `couponEffects.test.ts` passou a exigir o `coupon` na linha da mesa, que antes só o teste de rota cobria
- **Parados de propósito, com caller nenhum**: `applyCouponToBooking` e `removeCouponFromBooking` seguem inteiros e testados. São a validação que o fluxo do cliente vai chamar — vigência, escopo de roteiro/grupo, limite por cliente, cálculo do abatimento e a trava CP-07. Reescrever isso depois seria desperdício; o que saiu foi só a porta HTTP
- **Falta para o fluxo existir** (feature própria, não entrou): hoje a inscrição pelo portal cai na fila de revisão (`requestSelfEnrollment` → `pending_review`) e não tem pagamento. O cliente pagar na hora exige rota pública de validação do cupom, inscrição que nasce cobrável e o retorno do ASAAS fechando o ciclo

### Configurações → Equipe: o condutor da empresa — CF-05 ✅ (2026-08-31)

Aba **Equipe** em Configurações. Fecha o rumo que CF-04 tinha começado: os dados do condutor eram **constante no código** (`packages/application/src/bookings/roomlistLead.ts`, deletado nesta sessão), presos ao tenant `drk`.

- **Por que sair do código**: mudar um telefone exigia deploy; o dado pessoal — incluindo a data de nascimento de um menor — vivia no histórico do repositório para sempre; e nenhum outro tenant conseguia ter o seu condutor. Não era atalho de implementação, era um dado de negócio no lugar errado
- **O condutor não é cliente** — não tem inscrição, não paga, não gera cashback. Por isso vive em `settings.crew` (mesmo padrão de `settings.cashback` e `settings.branding`) e não na tabela `customers`, onde criaria uma pessoa que nenhuma regra do sistema sabe tratar
- **Validado como qualquer dado pessoal do sistema**: `parseCpf` com dígito verificador, `parseLocalDate`, `parsePhone` em E.164, `normalizeCep`, `parsePlate`. O documento que sai daqui vai para fora da empresa — validação frouxa aqui é um roomlist recusado no balcão do hotel
- **O veículo migrou de Empresa para Equipe**, saindo de `settings.branding.convoyVehicle`: o carro é do condutor, não da razão social. `CompanyInfo` voltou a ser só identidade
- **Endereço inteiro é opcional** — o hotel cobra o titular, não o CEP dele —, mas nome, CPF e nascimento não: é o registro que abre o documento
- **A trilha guarda contagens, não o cadastro** (`crew.update` com `{ companions, hasVehicle }`): auditoria de mudança não pode virar segunda cópia do dado pessoal (SEC-04)
- **Dois defeitos achados ao usar a tela**, os dois na borda e nenhum deles visível para os testes de domínio:
  - o regex de data do schema Zod estava escrito `^d{4}-d{2}-d{2}$` (as contrabarras se perderam ao escrever o arquivo) — **nenhum cadastro válido passava**, e o 400 genérico não dizia por quê
  - o DTO devolvia CPF, telefone e CEP crus, e o formulário reexibe o que a rota devolve: quem salvava `900.000.100-57` via `90000010057` voltar no campo. Agora pontua como `/v1/customers` já pontuava
  - os dois viraram `apps/server/src/routes/crew.test.ts` (7 testes de rota), que não existia — o caso de uso tinha testes, a borda não
- **Provado no drk**: cadastro salvo, página recarregada, dados voltando do banco formatados. `buildGroupRoomlist` e `buildGroupConvoyList` agora leem `tenants.getCrewLead(...)`
- **Nomes decididos pelo dono, sem renomear nada**: **Usuários** é quem acessa o sistema, **Equipe** é quem vai na saída, **Clientes** são clientes. A sobreposição fica só no código, onde `team` significa acesso e traduz para "equipe" — quem ler `inviteTeamMember` e procurar a aba Equipe cai na tela errada. Resolvido no glossário, não em refatoração. **A aba segue com um condutor só**: `settings.crew` guarda um `CrewLead`, e os "acompanhantes" são a família dele, não a equipe. Virar lista de membros (guia, apoio, mecânico) é a evolução natural quando a saída precisar — foi avaliada e adiada por ora

### Lista do comboio em PDF ou XLSX — GR-17 · CF-04 ✅ (2026-08-31)

Botão **"Gerar comboio"** com modal de formato: condutor, marca, modelo e placa de cada carro da saída.

- **Terceira leitura do mesmo grupo, terceira unidade**: quarto na roomlist (GR-15), pessoa no seguro (GR-16), **carro** aqui. É o que justifica três documentos em vez de um: cada um responde a uma pergunta diferente sobre a mesma saída
- **O veículo do condutor virou configuração (CF-04)**, não constante no código — decisão do dono do produto, corrigindo o rumo dos dados fixos. Marca, modelo e placa nasceram na aba Empresa, em `settings.branding.convoyVehicle`, e no mesmo dia migraram para a aba Equipe (CF-05) — o carro é do condutor, não da razão social. A placa é validada pelo `parsePlate` que já existia (CL-05), nos formatos antigo e Mercosul, e os três campos andam juntos: ou os três, ou nenhum
- **Inscrição sem carro aparece com o campo vazio**, por decisão do dono: "não existe inscrição sem carro, eu resolvo antes de aprovar". Justamente por isso a linha fica — o documento denuncia o que falta, e sumir com ela esconderia um carro do comboio
- **O XLSX é montado do zero**, ao contrário do seguro, que preenche o modelo da corretora: não há modelo de comboio, quem define o formato é a casa. São seis partes obrigatórias (`[Content_Types].xml`, rels, workbook, styles, sheet) — sem qualquer uma delas o Excel recusa o arquivo como corrompido. O `writeZip` do seguro foi reusado
- **O formato vai no caminho** (`comboio.pdf` / `comboio.xlsx`), não em parâmetro: assim o tipo do conteúdo e o nome do arquivo saem coerentes por construção, e formato desconhecido morre na validação da borda (400)
- **Placa fora do padrão sai como está** — cadastro antigo pode ter placa que a validação de hoje recusaria, e o comboio não é o lugar de descobrir isso
- **Cabeçalho da mesa com dois menus** (2026-08-31): os três botões de documento viraram itens de um menu **Documentos**, ao lado do menu de ações da saída, que já existia como menu e foi renomeado para **Menu**. Cinco disparadores lado a lado não cabiam no cabeçalho a 380px, e os três documentos respondem à mesma pergunta — "o que eu levo desta saída?". Cada item traz a dica do formato (PDF para o hotel, planilha da seguradora, PDF ou planilha), e item indisponível mostra o motivo, como no outro menu
- **Os dois menus ganharam ícone** (folha e três linhas), pelo `NavIcon` que já era o componente de ícones do sistema — SVG inline, `currentColor`, sem asset externo (design system §4). O `.btn` **não era flex** (todo botão do sistema era só texto), daí a classe de composição `.btn-icon`; o ícone entra a 17px, porque os 20px da navegação sobram num botão de 32px
- **Front**: o modal usa as classes que já existem (`overlay`, `modal`, `check-row`); nenhum componente novo de design system
- **Provado no navegador**: os dois formatos baixados e conferidos. PDF com cabeçalho e a linha `01 · Vanessa Santos · Ford · Ranger · SFG1H00`; planilha com o mesmo conteúdo, posição como número para ordenar direito
- **Estado**: suíte em **1.045 unit verdes**; typecheck, lint, `check:markers`, `check:rls` e prettier limpos

### Lista do seguro em XLSX — GR-16 ✅ (2026-08-31)

Botão **"Gerar seguro"** ao lado do da roomlist: baixa a planilha da seguradora com os participantes da saída.

- **O modelo é preenchido, não recriado.** `examples/Seguro.xlsx` (copiado para `packages/infrastructure/assets/`) traz o que faz a importação da corretora funcionar: validação de data na coluna de nascimento, o formato `000.000.000-00` que **repõe o zero à esquerda do CPF**, colunas ocultas de conferência, imagem e o texto de instrução. Recriar isso do zero seria refazer, com risco de divergir, um arquivo que a seguradora já aceita
- **Os tipos das células decidem se a planilha é aceita**: CPF entra como **número** (o estilo o pontua), nascimento como **serial de data** (a coluna tem validação de data — texto seria recusado), e nome/e-mail/telefone como texto. Telefone no formato do cabeçalho, `(48)999998877`
- **Zip escrito à mão** (~90 linhas, sem dependência): entrando só no `sheet1.xml`, **as outras 18 entradas saem byte a byte como entraram**. Uma biblioteca de planilha reescreveria o arquivo inteiro, e é aí que imagem, comentário e validação se perdem. O teste faz o round-trip com o modelo real e compara entrada por entrada
- **As linhas são editadas, não reconstruídas**: o modelo é zebrado e cada linha tem estilos próprios (13, 14 e 100 têm conjuntos diferentes). O preenchimento troca só o conteúdo, preservando o `s=` de cada célula
- **Uma linha por pessoa, não por família** — seguro cobre vida, não quarto. É a diferença para a roomlist. **Sem o condutor da empresa** (ele tem seguro próprio) e **sem repetir CPF**: um acompanhante em duas inscrições do mesmo grupo geraria duas cobranças
- **Mesma régua e mesmas guardas da roomlist**: só confirmadas, owner/admin, `no-store`, e uma linha na trilha (`insurance.generate`, só contagens)
- **Front generalizado**: `useRoomlist`/`RoomlistButton` viraram `useGroupDocument`/`GroupDocumentButtons`, que servem aos dois documentos. A mecânica (fetch → blob → âncora) e a régua (confirmadas + papel) eram idênticas; só as mensagens ficaram genéricas
- **Provado com dados reais do drk**: 2 pessoas (sem o condutor), planilha de 173.864 bytes com as 19 entradas do modelo intactas, células conferidas uma a uma (`B13=04241588921 | C13=Vanessa Santos | D13=30405 | E13=… | F13=(48)999998877`), e o download pelo botão na mesa
- **Estado**: suíte em **1.016 unit verdes**; typecheck, lint, `check:markers`, `check:rls` e prettier limpos

### Identidade da empresa: razão social, CNPJ e logo — CF-01..CF-03 ✅ (2026-08-31)

Aba **Empresa** em Configurações. Antes disso **não havia nenhuma tela nem rota para editar dados da empresa** — nome e CNPJ só existiam no banco, e o CNPJ do drk estava vazio, por isso o cabeçalho da roomlist saía só com o nome.

- **A logo mora na configuração do tenant** (`settings.branding.logo`), como data URI, **não em bucket**. O motivo é o consumidor que não é tela: o gerador de PDF roda no **servidor**, e o servidor não fala com o Storage — o upload de fotos é todo do navegador, com a RLS do bucket como guarda. Mandar a logo para um bucket exigiria dar ao servidor uma chave de serviço (poder demais para uma imagem de 40 KB) e um download HTTP por documento. Guardada com a config, ela chega na mesma leitura que traz nome e CNPJ. Sem migration: a coluna `settings` já existia
- **PNG ou JPEG, e só**: é o que o `pdf-lib` embute. O `uploadImages` do sistema converte tudo para **WebP**, que não serve — por isso a logo tem caminho próprio (`logoFile.ts`), que redimensiona para 600px e converte para **PNG**, preservando transparência (logo com fundo branco sobre papel branco não é logo)
- **Escrita que mescla**: `saveCompany` preserva o resto de `settings` — a config de cashback vive no mesmo objeto, e gravar o JSON inteiro a apagaria. É o tipo de perda que ninguém nota até o cashback parar de sair
- **Logo quebrada não derruba o documento**: `embedLogo` captura a falha e o PDF sai sem ela. O hotel espera a lista; uma imagem corrompida não pode custar a saída inteira
- **A marca da navegação passou a vir do servidor** (CF-02): antes `DK` e "Drakkar Expedições" estavam **literais no `App.tsx`**. Agora é logo, ou as iniciais derivadas do nome real. Um store mínimo com `useSyncExternalStore` liga a aba à navegação — salvar atualiza a marca na hora, sem F5, e sem buscar duas vezes
- **Trilha sem a imagem**: `company.update` grava só quais campos mudaram. A logo tem dezenas de milhares de caracteres e não é dado de investigação
- **Provado ponta a ponta no navegador**: PNG de teste enviado pela aba → prévia → salvar → marca trocando na sidebar sem reload → PDF regerado com a imagem embutida (XObject `/Image`, 240×80, arquivo 1.848 → 2.178 bytes). A logo de teste foi removida do drk depois
- **Estado**: suíte em **990 unit verdes**; typecheck, lint, `check:markers`, `check:rls` e prettier limpos
- **Fica para depois**: endereço e telefone da empresa na mesma aba (§5.10 os prevê), e a logo no portal do cliente

### Roomlist do grupo em PDF — GR-15 ✅ (2026-08-30)

Botão **"Gerar roomlist"** no cabeçalho da mesa: baixa o PDF que vai para o hotel. PRD novo em §5.5 (GR-15, e GR-14 regularizado — o check-in existia no código e nunca tinha entrado na tabela).

- **Primeira geração de documento do projeto.** Não havia nenhuma lib de PDF, nenhum download, nenhum bucket que aceitasse arquivo que não fosse imagem. Escolhido **`pdf-lib`** na infraestrutura: não toca em `fs` (o `pdfkit` carrega `.afm` do disco e é o tipo de coisa que sobrevive ao `tsx` e quebra no `dist` do Railway), traz os próprios tipos e produz **bytes determinísticos** quando a data é injetada — o que torna o teste do renderizador honesto
- **O documento é gerado sob demanda e não é guardado** (nem em Storage, nem em coluna). Guardá-lo criaria um segundo lugar onde CPF e endereço vivem, que envelhece sozinho e precisa ser eliminado junto com o cadastro (§11.5). É o mesmo raciocínio que dispensou o PDF do Termo (DOC-08)
- **Camadas**: `buildRoomlist` no domínio (numeração, dedup por CPF, formatação — puro, 11 testes); `buildGroupRoomlist` na aplicação (quem entra, papel, trilha); `roomlistPdf` na infra (paginação e acentuação como funções puras, testadas); `GET /v1/groups/:id/roomlist.pdf` na borda
- **Só inscrição confirmada** (GR-12) e **acompanhante da inscrição, não da família cadastrada** — nem todos vão em toda saída (GR-02), e mandar ao hotel quem ficou em casa seria dado errado e dado pessoal de terceiro sem finalidade
- **Acompanhante sai só com nome e nascimento**: o tipo `RoomlistGuest` não tem campo de CPF, e o teste também assere isso — o documento vai para fora da empresa
- **owner/admin apenas**, `Cache-Control: no-store` e uma linha na trilha por geração (`roomlist.generate`, só com contagens — a trilha registra que o documento saiu, não uma segunda cópia dele)
- **O condutor da empresa abre o documento**, com dados **fixos no código** — decisão do dono do produto, contra a recomendação. A mitigação: a constante vive num arquivo só, é atrelada ao tenant `drk` por **condição positiva** (`slug === 'drk'`) e **não é exportada no `index.ts`** do pacote, então nenhum outro módulo a alcança. Um tenant novo nasce sem condutor em vez de herdar este. Um teste garante que nem o nome nem o CPF aparecem na saída de outro tenant
- **`listByIds` novo no port de clientes** (fake/dev/prisma): a roomlist carrega responsáveis e acompanhantes de todas as inscrições **numa consulta só**. Total constante: 4 consultas, seja o grupo de 3 ou de 30 famílias
- **`CompanyInfo` ganhou `slug`** — sem consulta nova, a linha do tenant já era lida para o cabeçalho
- **Front**: `fetch → blob → âncora` (âncora simples cairia em 401, porque a rota exige `Authorization`), botão secundário ao lado do menu Saída, desabilitado com o motivo à vista quando falta confirmada ou papel
- **Dois defeitos que só apareceram no teste com dados reais**: telefone legado sem DDI (`48999998877`) saía cru no documento — `formatPhone` passou a aceitar DDD+número, o formato que o cadastro guardava antes da normalização E.164; e o nome do arquivo repetia a data (o nome do grupo já a traz)
- **Sem data de estadia no documento** (decisão do dono do produto, 2026-08-31): a expedição nem sempre dorme no mesmo hotel a viagem toda, e data impressa que não é a da estadia daquele hotel confunde a recepção. Saíram o período do cabeçalho, a data grudada no nome da saída e a do título do PDF; `withoutDates` remove só o que **é** data (`10/11/2026`, `05-07.09.26`, `2026-10-10`) e preserva número que identifica — "Grupo 24" e "Trilha 4x4" continuam. A **data de nascimento fica**: é dado do hóspede, exigido no check-in. A data ISO permanece só no nome do arquivo, que é o que ordena a pasta e separa duas saídas do mesmo roteiro
- **`headerLines` extraída como função pura**: dois testes anteriores liam os bytes do PDF procurando texto, e o pdf-lib comprime o content stream — um deles era **falso positivo**, passava com a data presente. Agora o cabeçalho é uma lista de strings testada diretamente
- **Provado com dados reais do drk** (script de fumaça, auditoria em memória, nada escrito no banco): 2 registros, 5 hóspedes, PDF válido, conteúdo conferido descomprimindo o stream — sem nenhuma data de saída
- **Estado**: suíte em **951 unit verdes**; typecheck, lint, `check:markers`, `check:rls` (38 tabelas) e prettier limpos; os cinco pacotes buildam
- **Limitação conhecida**: no shell nativo (Capacitor) `createObjectURL` + `download` não salva arquivo. A roomlist é ação de back-office no desktop; se um dia precisar no app, entra `@capacitor/filesystem` + `@capacitor/share`
- **Verificado no navegador** (2026-08-31): clique no menu, download do arquivo e o PDF com a logo da empresa no cabeçalho — 13.221 bytes contra 1.848 antes da logo

### Cupons de desconto — CP-01..CP-10 ✅ (2026-08-30)

Código promocional que abate valor de uma inscrição, no back-office. PRD novo em §5.15, mais um parágrafo em §3.4 fixando que **desconto não é preço**.

**A decisão que estrutura tudo: o desconto é linha própria.** O snapshot do participante (categoria + unitário congelados) é imutável, então o cupom entra como **resgate** (`coupon_redemptions`) e o contratado passa a ser `soma dos unitários − desconto`. Sobrescrever unitário — o caminho do GR-04 — perderia o rastro de qual campanha baixou o valor e quebraria o invariante de que a soma dos unitários é o que a tabela de preços dizia naquele dia.

- **Domínio puro** (TDD, 100% do arquivo): `normalizeCouponCode` (A-Z, dígito e hífen — cupom se dita por telefone), `checkCoupon` com **motivo tipado** (`inactive`, `not_started`, `expired`, `itinerary_not_allowed`, `group_not_allowed`, `not_for_this_customer`, `exhausted`, `customer_limit_reached`), `calculateCouponDiscount` e `applyPercentFloor` — **percentual arredonda para baixo**, porque centavo que sobra é desconto maior que o combinado (o gross-up do PG-04 arredonda para cima pelo mesmo raciocínio)
- **`contractedTotal` no domínio + `bookingContracted` na aplicação**: antes, "quanto vale esta inscrição" era `sumCents(unitários)` repetido em dez leitores. Com desconto isso vira divergência entre telas, então a derivação ganhou dono único — mesa, inscrições recentes, cashback, ficha do cliente, dashboard, financeiro, cobrança ASAAS e as rotas passaram todas por ele
- **O uso é lançamento, não contador**: usos ativos são `COUNT` dos resgates com `released_at` nulo — mesmo raciocínio de saldo em §3.6. Cancelar a inscrição **devolve o uso** (CP-08), e `cancelBooking` ganhou a dependência de cupons para isso
- **CP-07 — a guarda que evita devolução acidental**: aplicar cupom não pode deixar o contratado abaixo do já recebido. Sem ela, um desconto numa inscrição paga produziria saldo negativo, que o sistema leria como "a empresa deve"
- **CP-09**: a base `contracted` do cashback é a **já descontada** — não se paga crédito sobre dinheiro que o cupom tirou da venda
- **CP-10**: `code`, `mode` e `value` ficam congelados no resgate; editar ou desativar o cupom depois não muda inscrição que já o usou
- **Banco**: migration `20260830220000_add_coupons` — `coupons` e `coupon_redemptions`, RLS **só-equipe** nas duas (um cliente que lesse a tabela conheceria todo código em circulação, inclusive os nominais de outra família), `UNIQUE (tenant_id, code)`, CHECKs de percentual 0..100 e valor não negativo, e **índice único parcial** `(tenant_id, booking_id) WHERE released_at IS NULL` — um cupom ativo por inscrição. `coupons.rls.test.ts` cobre isolamento, audiência e as travas (roda no CI)
- **HTTP**: `GET/POST /v1/coupons`, `PATCH`/`DELETE /v1/coupons/:id`, e `POST`/`DELETE /v1/bookings/:id/coupon`. O motivo da recusa chega em código estável; a frase é da tela, porque `not_started` do cupom não é o `not_started` do check-in
- **UI**: seção **Cupons** em Configurações → Promoções (tabela com código, desconto, validade, usos/limite e situação; criar em cartão; ativar/desativar/excluir) e bloco **Cupom** no painel da inscrição, na mesa. Desconto **não é estado financeiro**: pill neutra e número em `--ink` — sem verde, sem vermelho, sem `--o`
- **Estado**: suíte em **902 unit verdes**; typecheck, lint, `check:markers`, `check:rls` (38 tabelas) e prettier limpos; `apps/web` e o server buildam
- **Não feito de propósito** (fora do escopo combinado): campo de cupom no portal do cliente, empilhar cupons, valor mínimo de compra. O domínio e o banco já suportam o portal sem migration nova — falta a rota pública de validação e a tela
- **Migration aplicada no Supabase do drk** em 2026-08-30 (`pnpm db:deploy`): as duas tabelas existem, com RLS habilitada e uma policy cada — verificado em `pg_class`/`pg_policies`.
  > **A lição:** entre escrever a migration e aplicá-la, o `dist` novo já lia `coupon_redemptions` em toda consulta de inscrição. Enquanto a tabela não existiu, mesa do grupo, inscrições, ficha do cliente e financeiro responderam erro contra o banco do drk. Migration que o código novo pressupõe não é passo de encerramento: vai junto do build que a exige.

### Painel do grupo — a faixa segue o caminho do dinheiro ✅ (2026-08-29)

Quatro números, nesta ordem: **projetado** (soma de todas as inscrições), **confirmado** (soma das que já pagaram), **recebido** e **a receber**.

- **Decisão do dono**, depois de considerar um quinto número com o líquido de taxas: a taxa é **repassada ao cliente** e nunca foi dinheiro da empresa, então um indicador para ela seria um número sem decisão associada. O que ele precisa saber é quanto vale o grupo, quanto disso é firme, quanto entrou e quanto falta
- Com PG-08 e PG-09, **"recebido" já é líquido**: todo lançamento — de cobrança ou manual — entra pelo que caiu na conta. Não há mais dois totais concorrendo
- Quando o cliente pagou mais do que entrou, a linha de contexto mostra *clientes pagaram R$ X* embaixo de "recebido". A diferença é a taxa, visível sem virar indicador
- **Movimentações** unificou cobranças e lançamentos numa tabela só, do mais recente para o mais antigo, com `Cliente paga · Entra na conta`. Só recebimento soma no rodapé: a cobrança é promessa, e somar as duas contaria o mesmo dinheiro duas vezes
- Lançamento manual e cancelamento viraram **botão + modal**, como emitir cobrança — formulário aberto o tempo todo ocupava o painel à toa. "à mão" virou **manual** no rótulo da linha
- **Emitir nota fiscal** existe como botão desabilitado: a emissão pelo ASAAS fica para depois de acertar os dados fiscais, e o lugar dela na tela já está definido

### O ledger registra o valor da inscrição, uma vez por cobrança (PG-08) ✅ (2026-08-29)

- **Decisão do dono, e ela simplifica o modelo**: o número de parcelas serve para calcular **quanto cobrar do cliente**, não para fatiar o recebimento. O que importa é ter entrado na conta o valor da inscrição
- **Cartão**: uma cobrança gera **um** lançamento, pelo valor da inscrição. A venda é aprovada inteira; as parcelas seguintes são o mesmo dinheiro chegando em pedaços e só interessam à conciliação. O `customerPaidCents` guarda o bruto total da venda
- **Boleto e pix parcelados** continuam quitando proporcionalmente: ali cada parcela é uma cobrança que o cliente paga sozinha, e pode nunca pagar a seguinte
- Antes: seis lançamentos de R$ 346,66 numa venda em 6x. Agora: um de R$ 2.080,00 — que é o que a inscrição vale
- A confirmação da inscrição segue no primeiro recebimento (IN-08)

#### O que a API das antecipações mostrou

Consultando `/anticipations` da conta: o custo cresce com o prazo de cada parcela — R$ 6,64 na primeira (32 dias) e R$ 39,82 na sexta (192 dias), R$ 199,99 no total. **A média não descreve isso**, e é por isso que o ledger não tenta espelhar parcela a parcela: ele registra o valor da inscrição, e o realizado por parcela fica na conciliação, onde é lido do provedor.

### Lançamento manual também desconta a taxa (PG-09) ✅ (2026-08-29)

- **Motivo**: pix, boleto e cartão registrados à mão *também chegam pelo ASAAS* — a conta recebe o valor menos a taxa. Lançar o valor cheio inflava o caixa em cada recebimento manual
- Um pix de R$ 100 vira **R$ 99,01** no ledger com a taxa fixa de R$ 0,99: `amountCents` é o que entrou, `customerPaidCents` é o que o cliente pagou. A mesma leitura das cobranças, então as Movimentações somam certo sem caso especial
- **Só dinheiro entra integral** — não passa por provedor nenhum. A conta é `netOfFee`, o inverso exato do gross-up: transação sobre o pago, antecipação sobre o que sobra dela (+6 testes de domínio)
- A taxa vem do **mesmo `/payments/simulate`** da emissão, no ambiente conectado (produção primeiro, sandbox se for o único). **Sem conta conectada, ou se o provedor não responder, o lançamento entra integral**: melhor um recebimento sem desconto do que recebimento nenhum
- A tela mostra a prévia enquanto se digita — *entra na conta R$ 99,01* — pela mesma função de domínio que o servidor usa ao gravar (+5 testes de aplicação)

### Gateway de pagamento — ASAAS (PG-01..PG-07) ✅ (2026-08-28)

Emitir cobrança pelo ASAAS, receber o pagamento sozinho e conciliar o que caiu na conta. **Decisão do dono do produto** que reverteu o PRD (que dizia "não há gateway"): §5.14 nova, §5.11 reescrita, fora-de-escopo corrigido. O lançamento manual continua existindo para o que é pago fora.

**Conectar (PG-01).** Sandbox e produção são conexões separadas, cada uma com chave e segredo próprios; exige owner/admin. A chave é **validada no ASAAS antes de ser guardada** — credencial errada só apareceria na primeira cobrança de verdade. Vai cifrada com AES-256-GCM (`tokenCipher`, +6 testes): a cifra vive na infraestrutura, a aplicação lida com o token em claro e o banco nunca vê a chave. `PAYMENT_TOKEN_KEY` no ambiente; sem ela o servidor **sobe**, mas conectar falha com mensagem — derrubar o sistema por uma integração opcional seria pior, guardar em claro muito pior. O segredo do webhook aparece **uma vez**, na conexão.

**Cobrar (PG-02/PG-04/PG-05).** O valor digitado é o **líquido**: o que precisa sobrar. O bruto sai por `bruto = (líquido / (1 − antecipação) + fixa) / (1 − transação)` — duas taxas com bases diferentes, arredondado para cima (faltar é receber menos que o combinado). A taxa da transação é **perguntada ao provedor** a cada cobrança (`POST /payments/simulate`), já na faixa de parcelas do plano: nesta conta 1,99% à vista, 2,49% em 2-6x, 2,99% em 7-12x, R$ 0,99 fixo no pix e no boleto. Só a antecipação é configurada, em % ao mês, porque essa o ASAAS não expõe por API. A prévia da tela usa o **mesmo caminho** da emissão.

**Receber (PG-03).** Webhook autenticado por segredo no cabeçalho, **idempotente por parcela** (a marca é o id da parcela no `reference` do recebimento) e silencioso com o que não reconhece — erro faria o provedor reenviar em laço. Pago lá, o recebimento entra no ledger e a inscrição confirma pela regra de sempre (IN-08).

**Registrar e conciliar (PG-06/PG-07).** Cobranças e lançamentos aparecem juntos, em **Movimentações**, no painel da inscrição: `Cliente paga · Esperado · Entra no caixa`. "Entra" só é preenchido onde há dinheiro novo — o recebimento gerado por cobrança fica com a coluna vazia, porque o valor já está na linha dela; é o que impede a soma de contar duas vezes. O botão **Conciliar** pergunta ao ASAAS o que de fato aconteceu: onde há antecipação, é o `netValue` dela que vale (valor exato, não estimativa); onde não há, o líquido da parcela. No financeiro, a mesma leitura com totais e a faixa *clientes pagaram · entra no caixa · taxas do gateway*.

**A taxa é informação, não despesa** (decisão do dono): aparece nas telas, não vira lançamento nem afeta a margem da saída.

#### Telas

- As duas ações que criam dinheiro — **lançar recebimento** e **emitir cobrança** — são botões que abrem modal, lado a lado no painel da inscrição. NF, confirmação, desfazer check-in e cancelamento ficam abaixo, como manutenção
- Cartão do ASAAS em Configurações → Integrações: um bloco por ambiente, verde/cinza para conectado, com a taxa de antecipação e o endereço do webhook

#### O que custou caro descobrir

Cinco erros achados em uso real, todos de modelo — vale registrar porque a lição vale para o próximo provedor:

- **Parcelamento tem uma cobrança por parcela**, com ids diferentes, e guardávamos só o da primeira. As parcelas 2 a 6 não achariam a cobrança e o recebimento delas **nunca entraria no ledger** — a inscrição ficaria paga por um sexto. Corrigido guardando o id do parcelamento.
- **Aprovado não é creditado**: o cartão aprovado (`CONFIRMED`) só vira dinheiro na data de crédito. A conciliação contava aprovação como recebimento — a mesma distinção que o webhook já respeitava e que não foi repetida ali.
- **A taxa de parcelamento não é por parcela**: é uma taxa de transação por venda, e o que cresce com as parcelas é a antecipação, pela **média** dos prazos (`(n+1)/2`), não pela soma. O modelo linear inflava a cobrança em R$ 113 num caso de R$ 2.280.
- **Reproduzir a tabela de preços do provedor foi o erro de origem**: o plano tem faixas por número de parcelas que ninguém digitaria. Perguntar ao ASAAS eliminou a classe inteira de erro.
- **O ciclo do ASAAS é de 32 dias**, não 30, e a antecipação incide sobre o líquido da transação, não sobre o bruto.

Duas guardas contra repetição: a régua de cálculo é uma função só do domínio, usada por servidor e tela; e a data em formato ISO virou constante única (`ISO_DATE`) depois de dois regex perderem as barras invertidas na geração de arquivo e engolirem datas em silêncio.

#### Banco e testes

- Migrations aplicadas: `payment_gateway`, `payment_fees`, `fee_model_monthly`, `charges_realtime`, `charge_installment_id`, `charge_settlement`, `charge_awaiting_credit`
- `payment_charges` entrou na publicação de realtime com REPLICA IDENTITY FULL: quem muda o estado da cobrança é o webhook, e sem isso a tela mostraria "aguardando" até alguém recarregar
- Suíte em **830 testes**, verdes

#### Limites conhecidos

- Os testes de RLS das tabelas novas rodam no CI, não localmente (sem Postgres nesta máquina)
- O `status` das antecipações foi assumido (`PENDING`/`SCHEDULED` = a caminho; o resto = creditado) — só se confirma quando a primeira antecipação for liberada de verdade
- "Taxas do gateway" cobre o que passa pelo ASAAS, inclusive o lançamento manual (PG-09); só dinheiro entra integral

### Check-in da inscrição (GR-14) ✅ (2026-08-28)

- **Regra no domínio**, não na tela: `checkInAvailability` decide pela janela da saída, pelo status e pela audiência — e é a **mesma função** que o servidor aplica e que o front usa para decidir se mostra o botão. Uma régua só (+6 testes)
- **Janela**: entre a data de início e a de término da saída, inclusive. Antes não há o que confirmar; depois já passou
- **Audiências com réguas diferentes** (decisão do dono): o cliente só faz check-in de inscrição **confirmada**; a equipe faz também da **pendente**, porque é ela que cobra no local. Cancelada não faz check-in de jeito nenhum
- **Desfazer é da equipe** — fica no painel da linha, não na linha: é correção de engano, não o caminho normal. Vai para a trilha (`booking.checkin` / `booking.checkin_undo`)
- Colunas `checked_in_at` / `checked_in_by` na própria inscrição (migration `20260828140000`): check-in é fato único por inscrição, não ledger
- **Na mesa do grupo**: coluna "Embarque" com botão (o clique não expande a linha) e, feito o check-in, a hora em pill verde. O **carro** entrou como segunda linha da célula de nome — é o que o design system manda (§5), e não custa uma coluna de largura
- `describeVehicle` resolve "Jeep Renegade" juntando catálogo e texto livre "Outro" (+3 testes); `listByCustomers` traz um carro por família **em uma consulta só**, senão a mesa faria N+1
- **No portal**: "Fazer check-in" no cartão da próxima aventura, ao lado do WhatsApp; some quando feito, dando lugar a "Check-in feito. Boa viagem!"
- `toLocalDate` do front usa o fuso **local**: por UTC o botão só abriria às 21h do dia anterior no Brasil (+2 testes)

### Realtime no funil inteiro, nas duas audiências ✅ (2026-08-28)

- **A causa de o portal só atualizar com F5**: `intake_events` não tinha policy de cliente. O Realtime respeita a RLS — sem poder ler a linha, o cliente nunca recebia o evento, então a badge "em análise" ficava até recarregar. Nova policy `customer_read` estreita: só pedido feito pelo app (`source = 'portal'`) cujo responsável está na própria família; payload de formulário do site segue invisível (+5 testes de RLS)
- **REPLICA IDENTITY FULL** nas sete tabelas do funil: com a identidade padrão (só a PK) o WAL não carrega as colunas que a RLS precisa avaliar, e **DELETE não é entregue a ninguém** — excluir uma saída não avisava nem o outro admin. É o preço em WAL para a tela não mentir
- Telas que passaram a ser ao vivo: **painel do cliente** (inscrição aprovada aparece, primeiro recebimento confirma, cancelamento some), **agenda** (saída criada/cancelada/excluída e a ocupação de cada uma), **dashboard** e o seletor de saídas da **fila**
- **Bug junto**: a saída escolhida no app vinha pré-selecionada mesmo depois de excluída — o botão "Alocar" ficava habilitado apontando para um grupo inexistente. `initialGroupId` só pré-seleciona o que ainda está na agenda (+3 testes)
- O pedido órfão da Vanessa foi descartado no banco com o mesmo motivo que o código passou a gravar

### Excluir a saída descarta os pedidos feitos para ela ✅ (2026-08-28)

- **Bug real observado no drk**: a equipe cancelou as inscrições e excluiu a saída, mas o **pedido do app** que apontava para aquele grupo continuou na fila — o cliente seguia vendo "pedido em análise" por uma saída que não existe, e o admin não tinha o que aprovar
- `deleteScheduleEvent` passou a **descartar os pedidos pendentes daquele grupo** (motivo "Saída excluída pela equipe") antes de apagar o evento (+1 teste). Port `listPendingRequestsByGroup` (fake/dev/prisma, filtro no JSONB do payload)
- O aviso do portal some sozinho: a badge lê a fila e a tela é ao vivo em `intake_events`
- **O pedido órfão que já existe não é limpo retroativamente** — a correção vale para as próximas exclusões; o atual sai pela ação "Descartar" na fila

### Agenda — calendário sempre visível e criar clicando no dia ✅ (2026-08-28)

- **O calendário é a tela, não o resultado**: aparece mesmo sem nenhum evento (antes o estado vazio o substituía). Sem evento, uma linha de ajuda convida a clicar num dia; com filtro sem resultado, o estado próprio continua, agora **abaixo** do calendário
- **Clicar num dia abre o modal de novo evento** com início e término já preenchidos com aquele dia (AG-02). A célula de fundo virou botão com `aria-label`; as barras de evento ficam por cima e seguem abrindo a mesa
- O calendário compartilhado só oferece o clique quando recebe `onSelectDay` — a agenda do portal segue **só leitura**
- Provado ao vivo: 42 células clicáveis no mês, modal abrindo com a data do dia clicado, e o calendário permanecendo na tela com filtro sem resultado

### Mesa — cancelada sai do grupo; exclusão da saída afinada ✅ (2026-08-28)

- **Cancelada não é mais participante da saída**: some da Tabela 1 (+2 testes). O registro vive na **lista de inscrições** (tela Inscrições), que já lista de todas as origens e situações — sem histórico paralelo dentro do grupo
- **Exclusão da saída** passou a barrar o que realmente importa (decisão do dono do produto): **inscrição ativa** ou **dinheiro movimentado** (recebimento de cliente ou pagamento a fornecedor → `group_has_money`). O que deixou de barrar: inscrição **cancelada sem dinheiro** e **gasto apenas contratado** — compromisso não é caixa. Testes reescritos (4 casos)

### Fila — detalhe do pedido antes de aprovar ✅ (2026-08-28)

- **`getIntakeDetail`** (TDD, 4 testes) + `GET /v1/intake/:id?groupId=`: quem vai, **a idade de cada um na data da saída** (§3.4 — é a da viagem que define a faixa, não a de hoje), o **valor** pelo algoritmo casal/solo + adicionais, se o responsável **já é cliente** (por CPF, IN-03) e o **saldo de cashback** dele. Sem saída escolhida não calcula idade nem valor: melhor não mostrar do que mostrar número que muda
- **Modal na fila** (clicar em "Ver detalhes"): responsável com CPF e contato, pills de "já é cliente"/"cadastro novo" e do cashback, acompanhantes com idade e faixa, seletor de saída, valor e as ações
- **Saída pré-selecionada** no pedido do app: o `chosenGroupId` do payload vira a sugestão da fila (e o valor default do seletor), à frente da sugestão automática por roteiro
- **Botão de WhatsApp** com o número do responsável (`wa.me` + mensagem inicial) — o canal real de confirmação antes de aprovar
- Trocar a saída no seletor **recalcula idade e valor**, porque a consulta leva o `groupId`

### Realtime nas inscrições (equipe e cliente) ✅ (2026-08-28)

- **`useLiveRefresh`** (hook compartilhado): assina as tabelas que a tela mostra, **coalesce a rajada** em 500ms (inscrição + participantes + recebimento numa transação viram um recarregamento só) e **relê do servidor** em vez de aplicar o payload — montar o estado a partir do evento duplicaria no front as derivações (recebido, ocupação, totais) que moram no caso de uso. A comunidade (CO-04) foi migrada para ele
- **Onde ficou ao vivo**: mesa do grupo (`bookings` filtrado por `group_id`, `booking_participants`, `booking_payments`), fila de alocação (`intake_events` + `bookings` — o que chega pelo webhook aparece sem F5), ficha do cliente (usada no portal e no back-office: status, recebimentos e cashback) e vitrine do portal (`groups`, `schedule_events`)
- **A RLS é o filtro de quem recebe o quê**: a equipe vê o tenant; o cliente, só a própria família. Consequência a saber: o cliente **não** vê as vagas mudarem quando outra família se inscreve — ele não lê aquelas linhas. Para isso seria preciso um canal de broadcast por tenant, que não foi feito
- **Publicação** `supabase_realtime` estendida para 7 tabelas (9 no total com as da comunidade), no `supabase-setup.sql` (idempotente) e aplicada no drk
- **Provado ao vivo** (Chrome, sessão da equipe): ao abrir a mesa, o canal `realtime:board-<groupId>` entra em **`joined`** com a conexão ativa — a assinatura das três tabelas foi aceita pelo servidor. **Não exercitado**: a chegada de um evento disparando o recarregamento (o grupo de teste está sem inscrições, e criar uma sujaria a mesa)
- Advisor de segurança sem alerta novo

## Sessão de 2026-08-27

**Back-office**

- Clientes: listagem/ordenação (CL-04) e nome/telefone normalizados na borda (CL-01/§3.2) — ver Fase 1
- **UI de CL-07/CL-10 na ficha** (menu Vínculo + três modais) e `family` no DTO da ficha
- **Edição de cadastro pela equipe (CL-06)**: aba Dados com todos os campos, endereço com ViaCEP, veículos (listar/editar, port novo) e **remover acompanhante** — `PATCH /v1/customers/:id`, `DELETE /v1/customers/:id`, auditoria por campo
- **Agenda (AG-04/AG-05)**: excluir bloqueado por qualquer lançamento, **cancelar saída** novo, menu Saída na mesa — seção própria
- **Devolução e conversão em crédito (§3.6)**: `kind` no ledger, `registerRefund`, UI na inscrição — seção própria
- **Roteiros**: até **20 fotos** e remoção que apaga o arquivo do Storage

**Portal do cliente**

- **Início** e **Expedições** em grade de 4 colunas com capa; **Agenda** completa no menu (mesmo calendário do admin, sem edição); **página do roteiro** com galeria 5:4 + miniaturas alinhadas, descrição, **valores** e **próximos grupos**
- **Inscrição** a partir da página do roteiro, modal abrindo com a família inteira marcada e o **valor da seleção** recalculado pelas funções do domínio
- **Orçamento da família** (§3.4) com a idade na data da saída

**Transversal**

- **Texto rico**: quebras de linha preservadas e o `#` por contexto (hashtag na comunidade, título no roteiro), no editor e na exibição

**Estado**

- **Suíte: 708 unit verdes**; typecheck / lint / markers / `check:rls` (34 tabelas) / prettier limpos; `apps/web` builda
- **Banco**: migration `add_payment_kind` aplicada e **ledger do Prisma realinhado** (24 registros; `migrate deploy` é no-op)
- **Verificado ao vivo** (Chrome, sessão da equipe): agenda do admin depois da refatoração do calendário, exclusão de saída ponta a ponta (DELETE 204), fotos/descrição/preços do roteiro pela API
- **Não verificado**: telas do portal renderizadas (a sessão aberta aqui é de equipe; falta um acesso de cliente) e o ciclo real de remover foto do Storage
- **Operacional**: rename que muda só a caixa do nome exige **reiniciar o Vite** no Windows — foi a causa da tela branca desta sessão, sem defeito no código

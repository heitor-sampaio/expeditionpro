# PRD — ExpeditionPRO
### Sistema de gestão de expedições 4x4 · v1.10.0

---

## 1. Contexto e objetivo

A Drakkar opera expedições 4x4 com grupos familiares, veículos próprios dos clientes e uma cadeia de fornecedores locais. A operação hoje vive em planilhas e no Notion.

**Objetivo do v1:** gerenciar uma expedição inteira em um só lugar — do lead que chega pelo webhook ao fechamento financeiro com fornecedores — com histórico auditável por cliente e por fornecedor.

**Objetivo estratégico:** multi-tenant desde a primeira migration. Virar SaaS deve ser decisão comercial, não rewrite.

**Princípio norteador:** este é um sistema financeiro antes de ser um CRM. Histórico é imutável; saldos são derivados.

> **Sobre o CRM (§5.16, §5.17).** O princípio acima continua valendo e não é retórica: ele
> decide o que acontece quando o funil e o ledger discordam. O funil vive **antes** do dinheiro
> e não encosta nele — oportunidade não tem pagamento, não entra em relatório financeiro e não
> vira linha de caixa. O valor previsto de uma oportunidade é uma aposta sobre o futuro; o
> ledger só registra o que aconteceu. Quando o negócio fecha, a oportunidade **gera** uma
> inscrição e para ali: daquele ponto em diante quem manda é o §3.6.
>
> Isso é o oposto do CRM que trata a venda como o centro e a contabilidade como consequência.
> Aqui a contabilidade é o centro, e o funil é a antessala — existe porque hoje quem conversa e
> não preenche o formulário não deixa rastro nenhum (§5.7.2), não porque o sistema tenha virado
> outra coisa.

---

## 2. Arquitetura

### 2.1 Stack

| Camada | Escolha |
|---|---|
| Front | React |
| Banco / Auth / Storage / Realtime | Supabase (Postgres) |
| ORM e migrations | Prisma |
| Mobile | Capacitor → Android e iOS |
| Hospedagem do server | Railway |

**Offline não é requisito** (Starlink em campo). O app mobile usa Capacitor com `server.url` apontando para o Railway, preservando o servidor — mesmo padrão já validado no BellarisOS.

### 2.2 Isolamento multi-tenant

Shared schema com `tenant_id UUID NOT NULL` em toda tabela de negócio. Índices compostos liderados por `tenant_id`; **todo unique é composto** (`UNIQUE (tenant_id, cpf)`, nunca `UNIQUE (cpf)`).

Duas camadas obrigatórias de isolamento:

1. **RLS habilitada em todas as tabelas**, com policies lendo `(auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid`. Usar `app_metadata` e não `user_metadata` — este último é editável pelo próprio usuário autenticado.
2. **Prisma Client Extension** injetando `tenantId` em todo `find*`, `create`, `update*` e `delete*` a partir do contexto da requisição. Necessária porque o role usado pelo Prisma tem `BYPASSRLS` — a policy não é avaliada nessa via.

Storage: buckets com path prefixado por `tenant_id` e policy correspondente.

Teste de fumaça obrigatório na fase 0: um teste automatizado que prova que o tenant A não enxerga dado do tenant B por nenhuma das duas vias.

### 2.3 Conexão

- Supavisor em **transaction mode** para a aplicação (`?pgbouncer=true&connection_limit=1`); `directUrl` na porta 5432 para migrations.
- Railway e Supabase na **mesma região**.

---

## 3. Modelo de domínio

### 3.1 Vocabulário

| Termo | Entidade | O que é |
|---|---|---|
| **Roteiro** | `itineraries` | O produto: Coxilha Rica, Vale Europeu. Descrição, fotos, faixas etárias e preços. |
| **Evento de agenda** | `schedule_events` | Roteiro + data início + data fim no calendário. |
| **Grupo** | `groups` | O grupo de uma saída. Onde as inscrições vivem. |
| **Inscrição** | `bookings` | Uma família dentro de um grupo. Linha da Tabela 1. |
| **Participante** | `booking_participants` | Cada pessoa dentro de uma inscrição. |
| **Cliente** | `customers` | Pessoa física. Única por `(tenant_id, cpf)`. |
| **Fornecedor** | `suppliers` | Parceiro que presta serviço na saída. |
| **Oportunidade** | `opportunities` | Alguém interessado, **antes** de virar inscrição. O cartão do funil (§5.16). |
| **Etapa** | `opportunity_stages` | Coluna do funil. Configurável por tenant. |
| **Conversa** | `conversations` | O fio com uma pessoa num canal de mensagem (§5.17). |
| **Mensagem** | `messages` | Cada troca dentro de uma conversa. |

> **Oportunidade não é cliente, e a diferença é o CPF.** `customers` exige CPF
> (`UNIQUE (tenant_id, cpf)`, §4) porque é a identidade que sustenta inscrição, contrato e
> dinheiro. Quem manda "quanto custa a Coxilha Rica?" no WhatsApp não tem CPF e não deveria
> precisar de um para ser lembrado. Por isso a oportunidade é entidade própria, e **nunca**
> vira cliente sozinha: quem promove é a equipe, no ato de fechar (OP-08).
>
> **Sobre "canal".** `communication_consents.channel` (§4) já significa `email | push`, e
> `conversations.channel` significa `whatsapp | instagram | messenger`. É o mesmo conceito —
> por onde se fala com a pessoa — em granularidade diferente, não um segundo vocabulário. Se
> um dia houver disparo ativo por WhatsApp, o consentimento daquela tabela cresce para
> cobri-lo, em vez de nascer um paralelo.

### 3.2 Clientes e vínculo familiar

Responsável e acompanhantes são **todos clientes registrados**, com ficha, histórico e CPF próprios. O vínculo é feito por auto-referência:

```
customers.responsible_id → customers.id   (nullable)
```

- Responsável: `responsible_id = NULL`
- Acompanhante: `responsible_id` aponta para o responsável

A "família" de um cliente é o responsável mais todos os acompanhantes que apontam para ele. Busca por qualquer membro resolve a família inteira.

**A hierarquia tem exatamente dois níveis.** Se A aponta para B, então B precisa ter `responsible_id = NULL`. Acompanhante nunca tem acompanhante. Garantido por trigger, não só por validação de formulário.

O limite de 4 acompanhantes é validação de formulário (configurável por tenant), não constraint de banco.

Campos do cadastro:

**Obrigatórios no responsável:** nome, CPF, data de nascimento, **telefone/WhatsApp** e e-mail. Telefone é o canal real de contato da operação — sem ele não há como confirmar pagamento, alinhar ponto de encontro ou avisar mudança de última hora. E-mail é a chave de login do portal.

- **Identificação:** nome, CPF (normalizado, validado por dígito verificador), data de nascimento, e-mail, telefone/WhatsApp
- **Endereço fiscal:** CEP com autocomplete (ViaCEP, com fallback manual e cache), rua, número, bairro, cidade, estado
- **Veículo:** marca, modelo, placa
- **Observações:** texto livre

**Obrigatório no acompanhante: apenas nome, CPF e data de nascimento.** Esses três não são negociáveis por motivo funcional — CPF é a chave de identidade e de deduplicação, e a data de nascimento define a faixa etária e, com ela, o preço. Todo o resto é opcional.

E-mail, telefone e endereço, quando vierem preenchidos, são aproveitados; quando não vierem, o cadastro segue igual e os dados de contato herdam do responsável. Acompanhante sem e-mail próprio apenas não recebe conta de portal.

> **Princípio de atrito na inscrição:** campo obrigatório é só o que trava a operação. Tudo o mais é coletado depois, pelo portal ou por contato direto. Inscrição abandonada no meio por falta de um dado raramente é retomada — o custo de perder a venda é maior que o de cobrar a informação depois.
>
> Obrigatório bloqueia o envio; opcional nunca bloqueia nada.

**Função é derivada, nunca digitada.** Ela vive no cadastro e é estável: `responsible_id IS NULL ? Responsável : Acompanhante`. Quem é responsável continua responsável em todas as saídas.

`responsible_id` é preenchido automaticamente pela primeira inscrição em que o cliente entra como acompanhante. Não há campo editável de função no formulário — a mudança acontece pelas operações de reorganização abaixo.

Cada inscrição guarda seu próprio `bookings.responsible_customer_id`, o que preserva o histórico: reorganizar uma família hoje não reescreve quem era o responsável de uma saída do ano passado.

### 3.2.1 Reorganização de vínculo familiar

Três operações disponíveis na ficha do cliente, todas registradas em `audit_logs`:

| Operação | Efeito | Regra |
|---|---|---|
| **Mover para outra família** | `responsible_id` passa a apontar para outro responsável | O destino precisa ser um responsável (`responsible_id IS NULL`) |
| **Tornar responsável** | `responsible_id = NULL`; o cliente passa a formar a própria família | Opcionalmente leva junto acompanhantes selecionados da família de origem — o caso de um casal com filhos que se separa da família dos pais |
| **Vincular como acompanhante** | Um responsável passa a apontar para outro | Bloqueado enquanto ele tiver acompanhantes; realocar ou promover os dependentes primeiro, para não criar órfão nem terceiro nível |

Regras de integridade:

- Nenhuma operação altera inscrições já existentes. Passado é imutável.
- Se o cliente tiver inscrição em grupo futuro ainda aberto, o sistema avisa antes de confirmar e mostra quais grupos serão afetados na próxima inscrição — a inscrição em si permanece intocada.
- Cashback e histórico financeiro seguem o cliente, não a família. Mover alguém nunca transfere saldo.

### 3.3 Veículos e catálogo

`vehicles` vinculado ao cliente: `brand_id`, `model_id`, `placa`, ano, cor.

Catálogo por tenant, editável nas configurações:

```
vehicle_brands(id, tenant_id, name, is_active)
vehicle_models(id, tenant_id, brand_id, name, is_active)
```

Comportamento no formulário — **combobox com busca**, para marca e para modelo:

1. Ao clicar, o campo abre a lista completa já visível, sem exigir digitação
2. Digitar filtra a lista em tempo real (match por substring, sem acento e sem caixa: "pajero sp" encontra "Pajero Sport"; "gran" encontra "Grand Cherokee" e "Grand Vitara")
3. A opção **"Outro"** fica **sempre visível**, fixada no rodapé da lista, inclusive quando o filtro não retorna nada
4. **Modelo** é filtrado pela marca escolhida. Sem marca selecionada, o campo fica desabilitado com a dica "selecione a marca"
5. Escolhendo "Outro", abre campo de texto livre; o valor grava em `vehicles.brand_other` / `vehicles.model_other` e marca `needs_catalog_review = true`
6. Marca = "Outro" libera o modelo como texto livre direto
7. Navegável por teclado (setas, Enter, Esc) e com alvo de toque adequado no mobile
8. Configurações → Veículos exibe a fila de itens não catalogados para promoção ao catálogo, com merge automático dos veículos que usaram aquele texto

Placa validada nos formatos antigo (`ABC1234`) e Mercosul (`ABC1D23`).

Seed inicial no **Anexo A** (21 marcas, 62 modelos extraídos do Notion).

### 3.4 Roteiros e precificação

Cada roteiro define **suas próprias faixas etárias e seus próprios valores**. As configurações da empresa guardam os valores padrão, herdados por roteiros novos.

Cinco categorias:

| Categoria | Chave | Natureza |
|---|---|---|
| Dupla/casal | `COUPLE` | Base da inscrição — **valor total para duas pessoas** |
| Solo | `SOLO` | Base da inscrição — **valor total para uma pessoa** |
| Adulto adicional | `EXTRA_ADULT` | Por pessoa, a partir do 3º adulto |
| Criança (faixa maior) | `CHILD_MID` | Por criança |
| Criança (faixa menor) | `CHILD_YOUNG` | Por criança |

Faixas etárias por roteiro (defaults: criança menor até 5, criança maior 6–10, adulto 11+):

```
itineraries.child_young_max_age  = 5
itineraries.child_mid_max_age    = 10
```

Cálculo do total da inscrição:

```
adultos    = participantes com idade > child_mid_max_age
base       = (adultos >= 2) ? preco_couple : preco_solo     // cobre 1 ou 2 adultos
extras     = max(0, adultos - 2) * preco_extra_adult
           + criancas_mid        * preco_child_mid
           + criancas_young      * preco_child_young
total      = base + extras
```

**Idade é sempre calculada na data de início do grupo**, a partir da data de nascimento, nunca na data da inscrição nem na data corrente.

**Snapshot obrigatório.** Cada `booking_participant` grava no momento da inscrição a categoria resolvida, o valor unitário em centavos, e a origem (`auto` ou `override` com motivo). Sem isso, três eventos reescrevem o passado: criança que faz aniversário antes da viagem, reajuste de preço do roteiro, e cortesia/desconto pontual.

Preços do roteiro são versionados por `valid_from` — reajuste nunca altera inscrição existente.

**Desconto não é preço.** Cupom (§5.15) e qualquer abatimento futuro entram como **linha própria** na inscrição, nunca reescrevendo o unitário congelado. O valor contratado passa a ser `soma dos unitários − desconto`. Misturar os dois perderia a resposta para "por que esta família pagou menos" e quebraria o invariante de que a soma dos unitários é o que a tabela de preços dizia naquele dia.

### 3.5 Agenda e grupos

Duas entidades, com ciclo de vida acoplado:

```
schedule_events(id, tenant_id, itinerary_id, start_date, end_date, title, notes, status)
groups(id, tenant_id, schedule_event_id UNIQUE NULL, itinerary_id, name, status, notes)
```

Regras:

| Ação na agenda | Efeito no grupo |
|---|---|
| Criar evento (roteiro + início + fim) | Cria grupo automaticamente, na mesma transação |
| Editar datas ou roteiro | Propaga ao grupo vinculado |
| Excluir evento | Exclui o grupo vinculado |
| Excluir evento cujo grupo tem inscrições | **Bloqueado.** Cancelar em vez de excluir |

`schedule_event_id` é nullable: também é possível criar um grupo avulso e vinculá-lo a um roteiro sem passar pela agenda.

**Vagas.** `groups.capacity_vehicles` é opcional: `NULL` significa sem limite, e nesse caso nada bloqueia inscrição. Quando há limite, **só inscrição confirmada ocupa vaga**.

Inscrição pendente aparece na lista do grupo, entra no total contratado projetado, mas não segura lugar. A consequência é deliberada: várias famílias podem estar pendentes na última vaga, e **quem paga primeiro leva**. Isso evita que uma inscrição abandonada trave a vaga até alguém triar, e é o comportamento coerente com "o pagamento confirma".

O contador do grupo mostra os três números separados: **confirmadas / vagas** e **pendentes**.

Lotar o grupo bloqueia novas inscrições pelo portal, mas **não mexe nas pendentes que já existiam**. Elas continuam na fila, sinalizadas como sem vaga, até você recusar ou abrir vaga extra. O sistema nunca recusa sozinho.

### 3.5.1 Expedições fechadas e personalizadas

Casos como "Dimas" e "Supresa 2025": saída montada para um grupo fechado, com roteiro que não existe no catálogo e preço negociado como pacote. Resolvido com dois eixos independentes, sem entidade nova.

**Eixo 1 — natureza do roteiro:** `itineraries.kind`

| `kind` | Comportamento |
|---|---|
| `catalog` | Roteiro regular. Aparece na vitrine do portal e no site. |
| `custom` | Roteiro criado para uma saída específica. Fora da vitrine, fora dos filtros públicos, mas com ficha, fotos e preços próprios como qualquer outro. |

**Eixo 2 — visibilidade do grupo:** `groups.visibility`

| `visibility` | Comportamento |
|---|---|
| `public` | Aparece na vitrine, aceita inscrição pelo portal. |
| `private` | Não aparece na vitrine. Inscrição só pelo back-office. Quem já está inscrito enxerga a saída normalmente em "minhas expedições". |

Os dois eixos são independentes de propósito: dá para fechar uma saída de roteiro do catálogo (uma Coxilha Rica exclusiva para uma empresa) sem precisar duplicar o roteiro.

**Eixo 3 — precificação:** `groups.pricing_mode`

| `pricing_mode` | Comportamento |
|---|---|
| `itinerary` | Padrão. Aplica as 5 categorias do roteiro conforme §3.4. |
| `manual` | Valor livre por inscrição, digitado pela equipe. As categorias não são aplicadas. |

`manual` existe porque grupo fechado costuma ser negociado como pacote — "R$ 28.000 pelos seis carros" — e forçar isso nas cinco categorias distorce o histórico de preço do roteiro. O valor continua congelado na inscrição e o financeiro funciona igual; só a origem do número muda.

O roteiro "Personalizado", que já existe na base, é o exemplo de `kind: custom`.

Grupo com inscrição nunca é deletado — recebe `status = cancelled` e soft delete. Registro que teve dinheiro associado precisa manter trilha de auditoria.

### 3.6 Dinheiro e saldos

- **`BIGINT` em centavos.** Nunca `float`, nunca `decimal` em JS.
- **Moeda única: BRL.** Roteiros na Argentina e no Chile são pagos em real a partir da conta da empresa, então não há coluna de moeda nem conversão. Se um dia surgir pagamento em moeda estrangeira, entra como campo novo, não como refatoração do ledger.
- **Saldos são derivados, nunca armazenados.** `valor_pago`, `a_receber`, saldo do fornecedor e saldo de cashback são `SUM()` sobre as tabelas de lançamento, expostos por view. Se performance apertar, a resposta é materialized view com refresh — não coluna mantida à mão.

### 3.7 Identidade e acesso

Duas audiências no mesmo Supabase Auth, separadas por `app_metadata`:

| Audiência | `app_metadata` | Enxerga |
|---|---|---|
| **Equipe** | `role: owner\|admin\|operator\|viewer` + `tenant_id` | Todo o back-office do tenant |
| **Cliente** | `role: customer` + `tenant_id` + `customer_id` | Só os próprios dados, as próprias inscrições, o próprio cashback e a comunidade do tenant |
| **Integração** | API key com `tenant_id` e escopos (§3.9) | Apenas o que o escopo da chave permite |

`customers.auth_user_id → auth.users.id` faz a ponte. Policies de RLS para `role = customer` são escritas separadamente e são muito mais restritas que as da equipe — cliente nunca lê `supplier_expenses`, `supplier_payments`, margem, nem dado de outra família.

**O que o cliente pode, por extenso.** A lista é fechada — o que não está aqui, ele não faz:

| Pode | Não pode |
|---|---|
| Ver a agenda — **só ver** | Procurar, criar, editar ou apagar outro cliente |
| Ver as expedições ativas (roteiro `active` + `catalog`, RO-07) | Criar, editar ou apagar roteiro |
| Se inscrever em uma ou mais expedições | Qualquer tipo de lançamento — recebimento, gasto, pagamento |
| Postar, curtir e comentar na comunidade | Criar ou apagar saída na agenda |
| Apagar o **próprio** post ou comentário; remover a **própria** curtida | Apagar publicação, comentário ou curtida de outro |
| Editar os próprios dados de contato (e-mail, telefone, endereço) | Trocar nome, CPF ou nascimento sem aprovação (PC-07) |

**A guarda vive no caso de uso, não na rota nem na RLS.** O servidor fala com o banco por um role com `BYPASSRLS`: a policy do Postgres não é avaliada nessa via, e a Prisma Client Extension injeta `tenantId` e mais nada. Os helpers estão em `packages/application/src/audience.ts` — `denyCustomer`, `requireTeam`, `requireSelfOrTeam`, `requireCustomer` — e a regra acima é testada em `audience.test.ts`.

`denyCustomer` barra só o cliente: `integration` (webhook do site) e `system` (job interno) agem por conta do tenant e seguem passando. Onde o mesmo caso de uso serve as duas audiências com escopos diferentes — `registerCompanion`, `saveVehicle` —, a guarda fica na **rota de back-office**, porque o portal chega neles por invólucros que escopam à própria família (PC-06, PC-08).

**Autenticação sem senha: magic link / OTP por e-mail.**

O cliente informa o e-mail, recebe um link de acesso válido por 15 minutos e de uso único, e entra. Não existe senha inicial, o que elimina a janela em que uma credencial adivinhável — CPF, data de nascimento, telefone — daria acesso ao extrato financeiro da família.

1. Convite inicial é o próprio magic link, enviado no cadastro
2. Link de uso único, expirando em 15 minutos, invalidado ao ser consumido
3. Sessão longa com refresh token, para não pedir e-mail a cada acesso — no app mobile a sessão persiste
4. Rate limiting no envio (por e-mail e por IP) para não virar vetor de spam
5. O cliente pode, opcionalmente, definir uma senha própria depois, dentro do portal
6. Cliente não enxerga o CPF de mais ninguém, e o próprio aparece mascarado

**Quem recebe login:** só cliente **maior de 18 anos com e-mail próprio**. Duas consequências diretas do modelo atual:

- Crianças das faixas 0–5 e 6–10 estão cadastradas como clientes e **não** podem ter conta.
- §3.2 permite que o acompanhante herde o e-mail do responsável quando o campo fica em branco. E-mail é a chave de login e precisa ser único — acompanhante sem e-mail próprio não gera conta, e o campo herdado passa a servir só para contato.

Clientes sem conta seguem existindo normalmente no back-office. `customers.portal_status: none | invited | active | disabled` controla o estado.

---

### 3.8 Campos personalizados por tenant

Sendo multi-tenant, cada operadora vai querer registrar coisa que a Drakkar não registra — tamanho de camiseta, número de apólice, contato de emergência, tipo sanguíneo. A solução **não** é tornar tudo configurável.

**Núcleo fixo, extras configuráveis.**

| | Núcleo | Personalizado |
|---|---|---|
| Exemplos | nome, CPF, nascimento, e-mail, telefone, endereço, marca, modelo, placa | qualquer outro |
| Tipagem | colunas tipadas e indexadas | `jsonb` na entidade |
| Editável pelo tenant | não | sim |
| Usado por regra de negócio | sim | não — só exibição, filtro e exportação |

```
custom_field_definitions(id, tenant_id,
  target: customer|companion|booking|supplier,
  key, label, type: text|number|date|select|multiselect|boolean|phone|email,
  options jsonb, required, help_text, position, is_active)

-- valores em customers.custom_fields jsonb, bookings.custom_fields jsonb, ...
```

**Por que o núcleo não entra no builder.** Esses campos são carga estrutural, não decoração:

- `birth_date` resolve a faixa etária e, com ela, o preço (§3.4)
- `cpf` é chave de identidade, de deduplicação e de dedup do webhook
- `address_*` sai na nota fiscal
- `brand` / `model` casam com o catálogo de veículos (§3.3)
- `email` é a chave de login do portal (§3.7)

Tornar isso configurável não produz um form builder — produz um motor de schema, no qual toda regra a jusante precisa virar dinâmica. É ordens de magnitude mais caro e cada regra dinâmica é um lugar a mais para errar cálculo de preço.

**O que o tenant configura:** quais campos personalizados existem, rótulo, tipo, obrigatoriedade, opções e ordem — e quais campos **opcionais do núcleo** ficam visíveis, obrigatórios ou ocultos no formulário público. Alergia, restrição alimentar, Instagram e perfil off-road do veículo saíram do escopo da Drakkar e voltam por aqui para o tenant que quiser.

O que o tenant **não** configura: existência, tipo e semântica dos campos do núcleo.

**Uma definição, duas superfícies.** A mesma `custom_field_definitions` alimenta o formulário público hospedado (§5.7.1) e o formulário do back-office. O contrato do webhook expõe os extras em `custom_fields`, com validação contra a definição — chave desconhecida vira aviso na fila de revisão, não erro que derruba a inscrição.

**Quando construir.** Depois de existir um segundo tenant real com um pedido concreto. Antes disso é generalização especulativa: você paga a complexidade agora e descobre o formato certo depois, quando já não dá para mudar barato. A modelagem acima já deixa o caminho aberto — `custom_fields jsonb` nas entidades desde a primeira migration custa quase nada e evita migration destrutiva lá na frente.

---

### 3.9 API keys

Terceira audiência do sistema, ao lado de equipe e cliente (§3.7): **integração**. Não é usuário, não tem sessão, não passa por magic link — é uma credencial de máquina emitida pelo tenant.

**Formato**

```
epk_live_drk_7f3a9c21e5b84d06af12cc90b7e4d3f8
└┬┘ └─┬┘ └┬┘ └──────────────┬───────────────┘
 │    │   │                 └ 32 bytes aleatórios (CSPRNG)
 │    │   └ prefixo do tenant
 │    └ ambiente: live | test
 └ marcador do produto
```

O prefixo visível (`epk_live_drk_`) serve para identificar a chave na interface e em log sem expor o segredo, e para varredura automática caso alguém cole uma chave num repositório público.

**Ciclo de vida**

| Regra | Motivo |
|---|---|
| Valor completo exibido **uma única vez**, na criação | Armazenamos apenas o hash; não há "ver chave de novo" |
| Guardada como hash (SHA-256), nunca em texto | Vazamento do banco não entrega credencial ativa |
| Várias chaves ativas por tenant | Rotação sem downtime: cria a nova, migra a origem, revoga a antiga |
| Revogação imediata e individual | Uma integração comprometida não derruba as outras |
| `expires_at` opcional | Chave de teste ou de fornecedor temporário morre sozinha |
| `last_used_at` e contador de uso | Descobrir chave esquecida antes de revogar |
| Nunca aparece em log, em erro ou em resposta | Mascarada como `epk_live_drk_••••d3f8` em qualquer exibição |

**Escopos.** Toda chave nasce com escopo mínimo, não com acesso total:

| Escopo | Permite |
|---|---|
| `intake:write` | Enviar inscrição pelo webhook |
| `public:read` | Ler saídas abertas e definição de campos (§5.7.2) |

Escopos adicionais entram conforme a API crescer. A regra é que uma chave nunca ganha permissão por padrão — o tenant marca o que ela pode fazer.

**Isolamento.** A chave carrega o `tenant_id`, então o `tenant_slug` da URL precisa bater com o dono da chave. Divergência → `401`, nunca `403` — não confirmar que o slug existe evita enumeração de tenants.

**Rate limit por chave**, não por IP: uma integração barulhenta não afeta as outras do mesmo tenant.

**Configurações → Integrações** lista as chaves com nome, prefixo, escopos, criada por, criada em, último uso e ação de revogar. Criação, revogação e alteração de escopo entram em `audit_logs`.

---

## 4. Esquema de dados

```
tenants(id, name, cnpj, address_*, phone, settings jsonb)
memberships(user_id, tenant_id, role: owner|admin|operator|viewer)

customers(id, tenant_id, responsible_id → customers.id NULL,
          full_name, cpf, birth_date,
          email, email_verified_at, phone, phone_verified_at,
          address_street, address_number, address_district,
          address_city, address_state, address_zip,
          notes, custom_fields jsonb, created_at, deleted_at)
  UNIQUE (tenant_id, cpf)

vehicle_brands(id, tenant_id, name, is_active)
vehicle_models(id, tenant_id, brand_id, name, is_active)
vehicles(id, tenant_id, customer_id, brand_id NULL, model_id NULL,
         brand_other, model_other, needs_catalog_review,
         plate, year, color)

suppliers(id, tenant_id, name, doc, doc_type: cpf|cnpj, phone, email, notes,
          pix_key, pix_key_type: cpf|cnpj|email|phone|random,
          category_id → supplier_categories NULL ON DELETE SET NULL)
supplier_categories(id, tenant_id, name)   -- UNIQUE (tenant_id, name)

itineraries(id, tenant_id, name, slug, description, difficulty, status,
            kind: catalog|custom,
            child_young_max_age, child_mid_max_age)
itinerary_photos(id, itinerary_id, storage_path, position, alt)
itinerary_prices(id, itinerary_id, valid_from,
                 couple_cents, solo_cents, extra_adult_cents,
                 child_mid_cents, child_young_cents)

schedule_events(id, tenant_id, itinerary_id, start_date, end_date,
                title, notes, status, deleted_at)
groups(id, tenant_id, schedule_event_id UNIQUE NULL, itinerary_id,
       name, status: draft|open|closed|in_progress|done|cancelled,
       capacity_vehicles NULL,  -- NULL = sem limite de vagas
       visibility: public|private,
       pricing_mode: itinerary|manual,
       cashback_override jsonb NULL,
       notes, deleted_at)

bookings(id, tenant_id, group_id, responsible_customer_id, vehicle_id,
         status: pending|confirmed|rejected|cancelled,
         confirmed_by, confirmed_at, confirmed_note,
         rejected_reason, cancelled_by, cancelled_at, cancelled_reason,
         cashback_rule_snapshot jsonb, custom_fields jsonb, notes,
         invoice_checked, invoice_checked_by, invoice_checked_at,
         invoice_number, invoice_issued_at,
         source: manual|webhook|portal, created_at, deleted_at)
  UNIQUE (group_id, responsible_customer_id)

booking_participants(id, booking_id, customer_id,
                     price_category, unit_price_cents,
                     price_source: auto|override, price_note)

booking_payments(id, booking_id, paid_at, amount_cents,
                 method: pix|boleto|card|cash, reference, notes)

supplier_expenses(id, tenant_id, group_id, supplier_id,
                  description, total_cents)
supplier_payments(id, supplier_expense_id, paid_at, amount_cents,
                  method: pix|boleto|card|cash, reference, notes)

cashback_entries(id, tenant_id, customer_id, booking_id,
                 type: accrual|redemption|expiry|adjustment,
                 amount_cents, available_from, expires_at, notes)

intake_events(id, tenant_id, source, external_id NULL,
              payload jsonb,        -- corpo cru, como chegou
              normalized jsonb,     -- saída do perfil de mapeamento
              form_id, itinerary_id NULL, preferred_date NULL,
              submitted_at, received_at,
              status: received|needs_allocation|allocated|discarded|error,
              error, discarded_reason,
              allocated_group_id NULL, booking_id NULL,
              allocated_by, allocated_at, is_test)
  UNIQUE (tenant_id, source, external_id)  -- parcial: WHERE external_id IS NOT NULL

form_mappings(id, tenant_id, source, form_id, itinerary_id)
  UNIQUE (tenant_id, source, form_id)

communication_consents(id, tenant_id, customer_id,
                       channel: email|push, granted_at, revoked_at, source)
push_tokens(id, tenant_id, customer_id, platform: ios|android, token, last_seen_at)

campaigns(id, tenant_id, type: email|push, name, subject, body,
          segment jsonb, status, scheduled_at, sent_at)
campaign_recipients(id, campaign_id, customer_id, status, sent_at, opened_at)

audit_logs(id, tenant_id, actor_user_id, entity, entity_id,
           action, diff jsonb, created_at)

custom_field_definitions(id, tenant_id,
  target: customer|companion|booking|supplier,
  key, label, type, options jsonb, required, help_text, position, is_active)
  UNIQUE (tenant_id, target, key)

legal_documents(id, tenant_id, kind, name, is_active)

legal_document_versions(id, document_id, version, content_json, content_html,
                        change_summary, requires_reacceptance,
                        published_at, published_by)
  UNIQUE (document_id, version)

document_acceptances(id, tenant_id, customer_id, document_version_id,
                     booking_id NULL, accepted_at, channel, ip, user_agent,
                     pdf_path)

api_keys(id, tenant_id, name, prefix, key_hash, scopes text[],
         environment: live|test, created_by, created_at,
         last_used_at, use_count, expires_at, revoked_at, revoked_by)
  UNIQUE (prefix)

-- portal do cliente
-- customers ganha: auth_user_id → auth.users.id,
--                  portal_status: none|invited|active|disabled,
--                  invited_at, last_login_at

profile_change_requests(id, tenant_id, customer_id, field, old_value,
                        new_value, status: pending|approved|rejected,
                        reviewed_by, reviewed_at, created_at)

-- comunidade
posts(id, tenant_id, author_customer_id, body,
      itinerary_id NULL, group_id NULL,
      status: draft|published|flagged|removed,
      removed_reason, published_at, created_at, deleted_at)
post_media(id, post_id, storage_path, kind: image|video, position, alt)
post_likes(post_id, customer_id, created_at)
  PRIMARY KEY (post_id, customer_id)
post_comments(id, post_id, author_customer_id, body,
              status: published|removed, created_at, deleted_at)
post_reports(id, tenant_id, post_id NULL, comment_id NULL,
             reporter_customer_id, reason, status: open|resolved|dismissed,
             resolved_by, resolved_at)
media_consents(id, tenant_id, customer_id, scope: community|marketing,
               granted_at, revoked_at, source)

opportunity_stages(id, tenant_id, name, position,
                   kind: open|won|lost, archived_at)
  UNIQUE (tenant_id, position)
opportunities(id, tenant_id, stage_id, contact_name, phone, email,
              itinerary_id NULL, customer_id NULL, booking_id NULL,
              expected_value_cents NULL, source: manual|whatsapp|instagram|messenger|site,
              lost_reason NULL, created_at, updated_at, deleted_at)

channel_integrations(id, tenant_id, channel: whatsapp|instagram|messenger,
                     provider: evolution|meta, base_url, external_account_id,
                     access_token, webhook_token_hash, active,
                     connected_by, connected_at)
  UNIQUE (tenant_id, channel)
conversations(id, tenant_id, channel, external_id,
              display_name, customer_id NULL, opportunity_id NULL,
              last_message_at, unread_count, created_at)
  UNIQUE (tenant_id, channel, external_id)
messages(id, tenant_id, conversation_id, external_id,
         direction: in|out, body, sent_by_user_id NULL,
         payload jsonb, sent_at, created_at)
  UNIQUE (tenant_id, conversation_id, external_id)
```

---

## 5. Requisitos funcionais

### 5.1 Clientes

| ID | Requisito |
|---|---|
| CL-01 | Cadastro completo conforme §3.2, com CPF validado e normalizado. |
| CL-01b | Indicadores de e-mail e telefone verificados na ficha e na fila de alocação; e-mail marcado como verificado ao consumir o magic link. |
| CL-02 | Autocomplete de endereço por CEP, com preenchimento manual quando a API falhar. |
| CL-03 | Formulário familiar: 1 responsável + N acompanhantes (limite configurável, default 4), cada um virando cliente próprio com `responsible_id` preenchido. |
| CL-04 | Busca por nome ou CPF retornando a família inteira. |
| CL-05 | Veículo com marca e modelo em combobox filtrável por digitação, "Outro" sempre visível, modelo em cascata da marca e placa validada. |
| CL-06 | Ficha do cliente com abas: **Expedições** (todas as saídas em que participou), **Financeiro** (lançamentos vinculados), **Cashback** (extrato e saldo). |
| CL-07 | Merge de clientes duplicados, com reatribuição de histórico. |
| CL-08 | CPF mascarado em listagens; completo apenas na ficha. |
| CL-09 | Função (responsável / acompanhante) derivada de `responsible_id`, sem campo editável no cadastro. |
| CL-10 | Reorganização de vínculo familiar conforme §3.2.1: mover para outra família, tornar responsável (levando acompanhantes selecionados) e vincular como acompanhante. |
| CL-11 | Trigger garantindo hierarquia de dois níveis — acompanhante nunca tem acompanhante. |

### 5.2 Fornecedores

| ID | Requisito |
|---|---|
| FO-01 | Cadastro: nome, telefone, CPF/CNPJ (validado conforme o tipo), e-mail, observações. |
| FO-02 | Criação inline a partir da tabela de gastos do grupo. |
| FO-03 | Ficha com histórico de expedições atendidas, total contratado, total pago, saldo em aberto. |
| FO-04 | Categoria do fornecedor, selecionada no cadastro e na edição, com criação inline pelo próprio seletor. Aparece como coluna no índice e na ficha. |
| FO-05 | Gerência do catálogo de categorias na tela de Fornecedores: listar, renomear e excluir. Renomear exige owner ou admin, porque alcança o histórico. **Excluir é bloqueado enquanto houver fornecedor na categoria** — o caminho é recategorizar os fornecedores antes. |
| FO-06 | Relatório de gastos por categoria: contratado, pago e em aberto por categoria, na **mesma janela do fechamento por saída** (data de início da saída e roteiro), de modo que os dois somem o mesmo total de gastos. Gasto de fornecedor sem categoria vira a linha "Sem categoria", nunca some. |
| FO-07 | **Chave PIX do fornecedor**, no cadastro e na edição. O tipo (CPF, CNPJ, e-mail, celular ou aleatória) **não é escolhido em seletor: sai da própria chave**, reconhecido na borda — quem cadastra cola o que o fornecedor mandou. Chave inválida é recusada com `422`. Guardada normalizada (dígitos, E.164 ou caixa baixa) e devolvida **formatada e inteira, nunca mascarada**: chave mascarada não se copia para o app do banco, e a área de fornecedor é só da equipe (SEC-01). |

> **A categoria é do fornecedor, não do gasto (FO-04..FO-06).** O gasto herda a categoria do
> fornecedor **na leitura**, e por isso recategorizar um fornecedor reclassifica o histórico
> dele inteiro. É o comportamento desejado: quando alguém percebe que o cadastro estava
> errado, quer o relatório certo desde o começo, não dali para a frente.
>
> É o oposto do preço da inscrição (§3.4), que é congelado — e a diferença é o que cada
> número significa. O unitário **é** o contrato com o cliente e não pode mudar; a categoria
> é só a gaveta em que a casa guarda o gasto para se olhar. Por isso mesmo, excluir uma
> categoria em uso é bloqueado: seria a mesma reescrita, só que em silêncio.

### 5.3 Roteiros

| ID | Requisito |
|---|---|
| RO-01 | Cadastro: nome, descrição rica, dificuldade, galeria de fotos (Supabase Storage, path por tenant). |
| RO-07 | **Para o cliente, a galeria é catálogo**: quem tem conta vê a ficha e as fotos de qualquer roteiro **ativo e `kind: catalog`** do tenant, mesmo sem nunca ter viajado — a galeria vive dentro da apresentação do roteiro, e foto sem nome não é apresentação. **Roteiro `custom` fica fora** (§3.5.1): saída fechada não entra em vitrine. Some-se a isso o roteiro de qualquer saída da própria família, mesmo `custom` ou arquivado, para o histórico do PC-09 não sumir. **Não abre** `itinerary_prices`, `schedule_events` nem `groups`: preço de catálogo é decisão comercial, e o cliente lê só o preço da própria saída (§3.7). |
| RO-02 | Configuração das faixas etárias e dos valores das 5 categorias, por roteiro, herdando o padrão da empresa. |
| RO-03 | Preços versionados por `valid_from`. |
| RO-04 | `kind: catalog \| custom` — roteiro personalizado fica fora da vitrine e dos filtros públicos. |

### 5.4 Agenda

| ID | Requisito |
|---|---|
| AG-01 | Calendário completo em visões mês, semana e lista, com filtro por roteiro e status. |
| AG-02 | Criar evento selecionando roteiro, data de início e data de término. |
| AG-03 | Criação do evento gera o grupo correspondente automaticamente. |
| AG-04 | Edição do evento propaga ao grupo; exclusão do evento exclui o grupo. |
| AG-05 | Exclusão bloqueada quando o grupo tem inscrições — oferece cancelamento. |
| AG-06 | Evento exibe ocupação no calendário: confirmadas / vagas, com as pendentes indicadas à parte. Sem limite definido, mostra só a contagem. |
| AG-07 | Grupo com `visibility: private` fica fora da vitrine do portal e marcado como fechado na agenda interna. |
| AG-08 | Grupo com `pricing_mode: manual` libera valor livre por inscrição, sem aplicar as categorias do roteiro. |

### 5.5 Grupo — Tabela 1: participantes

Uma linha por **família**. Colunas: família/responsável, participantes com categoria, veículo, **valor total**, **valor pago**, **valor a receber**, **observações**, **check de NF**.

| ID | Requisito |
|---|---|
| GR-01 | Adicionar participantes buscando por nome ou CPF de qualquer cliente cadastrado. |
| GR-02 | Ao encontrar, exibir a família completa e permitir **selecionar quais membros participam** — nem todos vão em toda saída. |
| GR-03 | Cálculo automático pelo algoritmo de §3.4, com categoria e valor congelados por participante. |
| GR-04 | Override manual de valor, por participante ou por inscrição, com motivo obrigatório. |
| GR-05 | Linha expansível para lançar recebimentos: data, valor, forma (pix / boleto / cartão / dinheiro). |
| GR-06 | Check de NF com registro de quem marcou e quando; número e data opcionais. |
| GR-07 | Totais no rodapé: contratado, recebido, a receber. |
| GR-12 | Inscrições pendentes aparecem na lista, visualmente distintas das confirmadas, e não ocupam vaga. |
| GR-13 | Totais separados entre confirmado e projetado (confirmado + pendente), para não inflar previsão de caixa. |
| GR-14 | Check-in da inscrição na saída, feito na mesa pela equipe ou pelo cliente no app, com registro de quem marcou e quando. |
| GR-17 | **Lista do comboio**, em PDF ou XLSX à escolha: condutor, marca, modelo e placa, uma linha por inscrição confirmada, com o veículo do condutor da empresa (CF-04) à frente. Inscrição sem veículo cadastrado **aparece com o campo vazio** — o documento denuncia o que falta em vez de esconder um carro do comboio. |
| GR-16 | **Lista do seguro em XLSX**, no modelo da seguradora: uma linha **por pessoa** (responsável e acompanhantes) das inscrições confirmadas, com CPF, nome, nascimento, e-mail e telefone. Sem o condutor da empresa — ele tem seguro próprio. Gerado sob demanda, restrito a owner/admin e registrado na trilha. |
| GR-15 | **Roomlist do grupo em PDF**, para enviar ao hotel: um registro por inscrição **confirmada**, com nome, CPF, nascimento, e-mail, telefone e endereço do responsável, e nome e nascimento dos acompanhantes daquela inscrição. O primeiro registro é sempre o **condutor da empresa**. Gerado sob demanda, **nunca armazenado**, restrito a owner/admin e registrado na trilha. |

> **Por que o seguro preenche o modelo, e não gera uma planilha nova (GR-16):** a planilha da seguradora não é só um cabeçalho — tem validação de data na coluna de nascimento, formato de CPF que repõe o zero à esquerda, colunas ocultas de conferência e o texto de instrução do próprio corretor. Recriar isso do zero seria refazer, com risco de divergir, um arquivo que a seguradora já aceita. O sistema abre o modelo, escreve as linhas a partir da 13 e devolve o arquivo com todo o resto intacto.

> **Por que o documento não traz data (GR-15):** a expedição nem sempre dorme no mesmo hotel a viagem inteira. Uma data impressa que não é a da estadia daquele hotel gera confusão na recepção, e a correção custa telefonema. O período de cada hotel é combinado direto com ele; o documento responde **quem chega e quantos são**. A data de nascimento continua, porque é dado do hóspede — o hotel a exige no check-in.

> **Por que a roomlist não é guardada (GR-15):** o arquivo é uma cópia consolidada de CPF e endereço de todas as famílias da saída. Guardá-lo criaria um segundo lugar onde esse dado vive, que envelhece sozinho e precisa ser eliminado junto com o cadastro (§11.5). Gerar na hora custa milissegundos e mantém uma fonte só — o mesmo raciocínio que dispensou o PDF do Termo (DOC-08).

> **Por que só confirmadas:** é quem ocupa vaga (GR-12). Mandar pendente ao hotel é reservar quarto para quem ainda pode não ir, e a correção depois custa mais que a segunda geração do documento.

> **O condutor da empresa** é quem conduz a expedição e se hospeda junto. Não é cliente: não tem inscrição, não paga e não gera cashback — por isso entra no documento por configuração da empresa (CF-05), não pelo cadastro de clientes. Sem condutor declarado, os documentos saem só com os clientes.

### 5.6 Grupo — Tabela 2: pagamentos e gastos

Uma linha por **fornecedor**. Colunas: fornecedor, descrição, valor total, valor pago, saldo.

| ID | Requisito |
|---|---|
| GR-08 | Adicionar fornecedor existente ou criar novo inline. |
| GR-09 | Linha expansível com registro de pagamentos: data, valor, forma (pix / boleto / cartão / dinheiro). |
| GR-10 | Resultado do grupo: receita − gastos, margem bruta e percentual. |
| GR-11 | Todo lançamento reflete automaticamente no histórico financeiro do cliente e do fornecedor. |
| GR-18 | Excluir um gasto lançado errado. **Exclusão lógica** — o registro sai das leituras e fica na tabela. **Gasto com pagamento lançado não é excluído**: o pagamento é casado com o grupo, não com o gasto vivo, então apagar a obrigação deixaria o dinheiro pago sem contratado por trás e a margem sairia errada. Exige owner ou admin, como excluir recebimento (IN-09). |

### 5.7 Inscrições

| ID | Requisito |
|---|---|
| IN-01 | Receptor valida a `api_token`, grava o corpo cru em `intake_events` e responde `202` na hora. Processamento assíncrono. Contrato em §5.7.1. |
| IN-01b | Perfil de mapeamento por `source`, traduzindo o formato da origem para a forma interna sem alterar o domínio. |
| IN-02 | Deduplicação por `{form_id}:{entry_id}` na chegada e por `UNIQUE (group_id, responsible_customer_id)` na alocação. |
| IN-03 | Na alocação, matching por CPF normalizado. Cliente não existe → cria. Existe → reaproveita, sem recadastrar. |
| IN-04 | Divergência de dados (CPF conhecido chegando com nome ou telefone diferente) entra em fila de revisão em vez de sobrescrever. |
| IN-05 | Falha de processamento → status `error` com payload preservado e botão de reprocessar. |
| IN-06 | CRUD manual completo: adicionar, editar e excluir inscrição, com auditoria. |
| IN-07 | Toda inscrição nasce `pending`, qualquer que seja a origem. |
| IN-07b | Inscrição vinda de webhook entra na **fila de alocação** e só vira `booking` quando o admin escolher o grupo (§5.7.2). |
| IN-08 | **O primeiro pagamento confirma a inscrição.** Lançar o primeiro recebimento de uma inscrição `pending` — integral ou parcial — muda o status para `confirmed` na mesma transação, gravando `confirmed_by` e `confirmed_at`. |
| IN-09 | Lançamento de pagamento restrito a `owner` e `admin`, já que é o ato que confirma. `operator` cria e edita inscrição, mas não confirma. |
| IN-10 | Confirmação manual sem pagamento disponível como exceção (cortesia, permuta, acerto fora do sistema), com motivo obrigatório registrado em `confirmed_note`. |
| IN-11 | Excluir o único pagamento de uma inscrição confirmada **não** reverte o status automaticamente — o sistema alerta e exige decisão explícita. |
| IN-12 | Fila de inscrições pendentes com recusar (motivo obrigatório) e alerta de pendência parada há mais de **24 horas**, configurável. |
| IN-13 | **Recusa é sempre manual.** O sistema nunca recusa nem expira inscrição sozinho, inclusive quando a saída lota. |
| IN-14 | Pendente em saída lotada recebe destaque na fila, com a indicação de que não há mais vaga — a decisão de recusar ou abrir vaga extra é sua. |
| IN-15 | **Cancelamento é feito apenas pela equipe**, com motivo obrigatório. O cliente não cancela pelo portal; a solicitação chega por contato direto. |
| IN-16 | Cancelar inscrição com pagamento lançado não apaga o recebimento — o valor fica no ledger e o tratamento (devolução, crédito, retenção) é decidido caso a caso. |
| IN-17 | Fila de alocação com estados `received`, `needs_allocation`, `allocated`, `discarded`, `error`. |
| IN-18 | Alocação em transação única: cria ou reaproveita o cliente, cria acompanhantes, cria `booking` em `pending`, resolve categorias pela data do grupo e congela preços. |
| IN-19 | Edição dos dados na fila antes de alocar, e descarte com motivo. |
| IN-20 | Mapa `form_id` → roteiro em Configurações → Integrações, para a fila filtrar só os grupos do roteiro certo. |
| IN-20b | A fila pré-seleciona o próximo grupo aberto do roteiro como sugestão, sempre editável e nunca aplicada sem confirmação. |
| IN-21 | Gestão de API keys em Configurações → Integrações: criar com nome e escopos, exibir o valor uma única vez, listar com prefixo e último uso, revogar (§3.9). |
| IN-22 | Chave conferida antes de qualquer gravação; inválida, revogada, expirada, sem escopo ou de outro tenant → `401`. |
| IN-23 | Rate limit por chave, não por IP. |
| IN-24 | `GET /groups?status=open` e `GET /form-schema` como leitura pública, com CORS restrito aos domínios do tenant. |

#### 5.7.1 Contrato de entrada

O receptor não impõe um formato único de payload. Ele grava o corpo cru e aplica um **perfil de mapeamento** escolhido pelo `source`, que traduz o formato da origem para a forma interna.

```
payload cru  →  intake_events  →  perfil de mapeamento  →  forma interna
```

Isso resolve os dois lados: hoje o sistema aceita exatamente o payload que o formulário já emite, sem interceptador no meio; amanhã, outro tenant com outro formulário ganha o próprio perfil sem que ninguém mexa no domínio. Perfil é uma função de tradução, não schema de banco.

**Perfis no v1**

| `source` | Formato |
|---|---|
| `wp_flat_v1` | Campos planos em `fields`, cada um como `{label, value, formatted}` — formato nativo de plugin de formulário |
| `canonical_v1` | Objetos aninhados (`responsible`, `vehicle`, `companions[]`) — para integrações que controlam o próprio payload |

---

**Endpoint**

```
POST https://<host>/v1/intake/{tenant_slug}
Content-Type: application/json
api_token: epk_live_drk_7f3a9c21e5b84d06af12cc90b7e4d3f8
```

Autenticação por API key (§3.9), escopo `intake:write`, conferida antes de qualquer gravação.

---

**Perfil `wp_flat_v1`**

Aceita o corpo como **array de um elemento** ou como objeto direto. Quando array, lê `[0].body`. `webhookUrl`, `executionMode`, `headers`, `params` e `query` são ignorados.

```json
{
  "entry_id": 2,
  "form_id": 4641,
  "form_title": "Coxilha Rica",
  "submitted": "2026-08-11T18:57:17-03:00",
  "fields": {
    "resp_nome":       { "value": "Heitor Sampaio" },
    "resp_cpf":        { "value": "90000010057" },
    "resp_email":      { "value": "contato@exemplo.com" },
    "resp_telefone":   { "value": "48999998877" },
    "resp_nascimento": { "value": "1989-01-14" },
    "cep":       { "value": "88036100" },
    "endereco":  { "value": "Rua Luiz Pasteur" },
    "numero":    { "value": "509" },
    "bairro":    { "value": "Trindade" },
    "cidade":    { "value": "Florianópolis" },
    "estado":    { "value": "SC" },
    "marca":  { "value": "Ford" },
    "modelo": { "value": "Ranger" },
    "placa":  { "value": "SFG0H61" },
    "qtd_acompanhantes": { "value": "2" },
    "acomp_1_nome":       { "value": "Fulana de Tal" },
    "acomp_1_cpf":        { "value": "12345678909" },
    "acomp_1_nascimento": { "value": "2015-03-22" },
    "acomp_2_nome":       { "value": "Beltrano de Tal" },
    "acomp_2_cpf":        { "value": "98765432100" },
    "acomp_2_nascimento": { "value": "2018-07-09" },
    "aceite": { "value": "1" },
    "data_desejada": { "value": "2026-09-25" }
  }
}
```

**Convenção de acompanhantes:** `acomp_{n}_nome`, `acomp_{n}_cpf`, `acomp_{n}_nascimento`, com `n` começando em 1. O parser varre todas as chaves que casam com `acomp_\d+_*` em vez de confiar em `qtd_acompanhantes` — se o número não bater com os campos presentes, vale o que veio e a divergência entra como aviso na fila.

**Leitura de campo:** sempre `value`, nunca `formatted`. `formatted` é apresentação e é ambíguo — em `estado` traz `"Santa Catarina"` quando o sistema quer `"SC"`.

**Obrigatório bloqueia. Opcional não bloqueia. Só isso.**

| Campo | Ausente ou vazio |
|---|---|
| `resp_nome`, `resp_cpf`, `resp_nascimento`, `resp_telefone`, `resp_email` | `422` com o campo culpado |
| `acomp_{n}_nome`, `acomp_{n}_cpf`, `acomp_{n}_nascimento` — quando o bloco existe | `422` com o campo culpado |
| Qualquer outro campo do núcleo | Aceita, grava vazio, segue |
| Campo desconhecido | Aceita, vai para `custom_fields`, gera aviso na fila |

Campo opcional ausente nunca gera `422`, nunca marca a inscrição como `error` e nunca impede a alocação.

**Três níveis de validação, e nem todo campo alcança o primeiro:**

| Nível | Campos | O que dá para afirmar |
|---|---|---|
| **Verificável** | CPF, data de nascimento, placa | Tem dígito verificador ou regra formal — dá para dizer que o valor é inválido |
| **Só formato** | e-mail, telefone, CEP | Dá para dizer que está malformado. **Não** dá para dizer que existe, que funciona ou que é da pessoa |
| **Nenhuma** | nome, endereço, observações | Só presença |

Para e-mail e telefone, a checagem é deliberadamente **frouxa**: e-mail precisa ter `@` e domínio plausível; telefone precisa ter 10 ou 11 dígitos após o DDI. Regex agressiva de e-mail rejeita endereço válido e cria um problema pior que o que resolve, e formato de telefone varia demais.

Valor malformado em campo **opcional** não bloqueia: grava como veio, marca `needs_review` e registra aviso na fila.

**A verificação real acontece pelo uso, não na validação.** É isso que substitui a validação impossível:

- `email_verified_at` é preenchido quando o cliente consome o magic link. Até lá, o e-mail é uma string que alguém digitou
- `phone_verified_at` é preenchido manualmente pela equipe quando houver contato efetivo por WhatsApp
- O back-office exibe **"e-mail não verificado"** e **"telefone não verificado"** na ficha e na fila de alocação

Isso transforma um problema sem solução técnica em um estado observável: em vez de fingir que validou, o sistema mostra em quais contatos você ainda não pode confiar — o que importa justamente na hora de cobrar o pagamento que confirma a inscrição.

**Normalização aplicada pelo perfil**

| Campo | Tratamento |
|---|---|
| `resp_cpf`, `acomp_*_cpf` | só dígitos; validar dígito verificador |
| `resp_telefone` | **obrigatório**; só dígitos → E.164; formato apenas |
| `resp_nascimento`, `acomp_*_nascimento` | ISO `YYYY-MM-DD` |
| `cep` | só dígitos |
| `estado` | UF de duas letras |
| `placa` | uppercase; validar formato antigo e Mercosul |
| `marca`, `modelo` | casar com o catálogo sem acento e sem caixa; sem match → `brand_other` / `model_other` com `needs_catalog_review` |
| `aceite` | `"1"` registra consentimento com data e `form_id` |
| `submitted` | `timestamptz`, preservando o offset |

**Respostas**

| Código | Situação |
|---|---|
| `202` | Aceito e enfileirado — `{ "intake_id": "...", "status": "queued" }` |
| `200` | Já processado — `{ "intake_id": "...", "status": "duplicate" }` |
| `401` | `api_token` ausente, inválido, revogado, expirado, sem escopo ou de outro tenant |
| `422` | Formato inválido — `{ "error": "validation_failed", "fields": { "resp_cpf": "invalid_check_digit" } }` |
| `429` | Rate limit, com `Retry-After` |

---

#### 5.7.2 Fila de alocação

**A inscrição que chega pelo webhook não vira `booking` na hora.** Ela entra na fila como `intake_event` sem grupo, e é o admin que aloca.

Isso vem do fato de o formulário ser por **roteiro**, não por saída: alguém pode se inscrever hoje para uma Coxilha Rica de dezembro, e não necessariamente para a próxima. Adivinhar a data erra, e errar aqui significa colocar a família no grupo errado — com preço congelado da data errada.

**Estados**

```
received → needs_allocation → allocated
                ↓
            discarded | error
```

| Estado | Significado |
|---|---|
| `received` | Corpo gravado, ainda não processado |
| `needs_allocation` | Dados normalizados e válidos, aguardando o admin escolher o grupo |
| `allocated` | Grupo escolhido; cliente e `booking` criados em `pending` |
| `discarded` | Descartado pelo admin, com motivo |
| `error` | Falha de processamento; payload preservado, com botão de reprocessar |

**Tela da fila.** Uma linha por inscrição recebida, mostrando responsável, CPF, acompanhantes com idade, veículo, roteiro identificado, data desejada (se veio) e há quanto tempo está parada. Ações: **alocar em um grupo**, editar dados antes de alocar, descartar com motivo.

Ao alocar, o sistema em uma transação: cria ou reaproveita o cliente por CPF, cria os acompanhantes vinculados, cria o `booking` em `pending`, resolve a categoria de cada participante **pela data de início daquele grupo** e congela os preços.

> **Por que congelar só na alocação:** faixa etária é calculada na data de início da saída (§3.4). Sem grupo definido não existe data, e sem data não existe preço. Congelar na chegada exigiria adivinhar a saída — exatamente o que a fila evita.

**O formulário não pergunta a data. Decisão de conversão, não de arquitetura.**

Expor as datas futuras dá ao cliente um motivo para adiar — e adiamento em inscrição vinda de anúncio costuma virar desistência. O formulário fica com o mínimo de atrito: a pessoa se inscreve, a alocação é problema seu.

O sistema acomoda isso sem campo novo, apoiado em como a demanda de fato chega:

| Origem da inscrição | Como a alocação resolve |
|---|---|
| Anúncio → formulário | Quase sempre é o próximo grupo aberto do roteiro. A fila **sugere** esse grupo; um clique confirma |
| WhatsApp → conversa → formulário | Você já sabe a data combinada. Escolhe o grupo na fila, inclusive um futuro |

A sugestão é só um atalho da tela, nunca uma decisão automática: nada é alocado sem você clicar, e a fila mostra todos os grupos abertos do roteiro, não apenas o próximo.

**Duas configurações que ajudam sem tocar no formulário:**

- **Mapa `form_id` → roteiro**, em Configurações → Integrações. Custo zero na origem, e evita casar roteiro por `form_title` — que quebra no dia em que você renomear o formulário.
- **Campo oculto `group_ref`**, opcional, para tenants cujo formulário seja por saída. Quando vem, a alocação é automática e a fila serve de conferência. O formulário da Drakkar não usa.

**Endpoints de leitura**

```
GET /v1/public/{tenant_slug}/groups?status=open
```
Saídas abertas: `group_ref`, roteiro, datas, vagas restantes e preços das 5 categorias. Serve a integrações que precisem montar agenda, calculadora de preço ou formulário por saída. O formulário da Drakkar não consome.

```
GET /v1/public/{tenant_slug}/form-schema
```
Campos que o tenant espera receber, com `key`, `type`, `required` e `options`. Opcional.

Ambos são leitura pública sem dado de cliente, com CORS restrito aos domínios do tenant, rate limit e cache curto.

> **Por que staging e não escrita direta:** dado de formulário externo é sujo — CPF com typo, nome em caixa alta, telefone sem DDD, a mesma pessoa se inscrevendo duas vezes. Auto-merge silencioso corrompe a base de um jeito difícil de reverter. A tabela de staging custa um dia de trabalho e evita um mês de limpeza.

### 5.8 Cashback

A regra vive nas configurações da empresa e pode ser sobrescrita por grupo, o que permite usar cashback como campanha pontual.

**Configuração da empresa (padrão herdado)**

| Campo | Valores | Sugestão de default |
|---|---|---|
| `cashback_enabled` | switch geral do módulo | desligado |
| `cashback_mode` | `percent` ou `fixed` | `percent` |
| `cashback_value` | % ou valor em centavos | `0` |
| `cashback_base` | `paid` (valor pago) ou `contracted` (valor da inscrição) | `paid` |
| `cashback_release_days` | dias após o término da saída | `0` |
| `cashback_validity_months` | validade do crédito; `0` = sem prazo | `0` |
| `cashback_max_redemption_pct` | teto de uso numa inscrição; `0` = sem teto | `0` |

Todos os valores **nascem zerados** e o módulo nasce desligado. Nada de default escondido gerando crédito sem você ter configurado.

**Switch geral.** `cashback_enabled` liga ou desliga o módulo inteiro no tenant. Desligado, o cashback some da interface, do portal e do cálculo — não fica campo zerado ocupando tela.

**Por grupo — três estados, não booleano**

`groups.cashback_override` aceita:

| Estado | Efeito |
|---|---|
| `inherit` (default) | Segue a configuração da empresa, seja ela qual for |
| `off` | Esta saída não gera crédito, mesmo com o módulo ligado |
| `custom` | Regra própria: `mode`, `value` e demais parâmetros só desta saída |

Booleano não bastaria: "herdar" e "ligado" são coisas diferentes. Se o override fosse `true/false`, desligar o módulo geral deixaria todo grupo marcado `true` gerando crédito, ou obrigaria a varrer os grupos a cada mudança de configuração. Com `inherit` explícito, a saída acompanha o padrão sem congelá-lo.

Isso é o que permite usar cashback como **campanha**: módulo desligado por padrão, e um grupo específico com `custom` — "nesta expedição, R$ 300 de crédito" — sem afetar o resto.

| ID | Requisito |
|---|---|
| CB-01 | Regra por percentual **ou** valor fixo, definida nas configurações da empresa. |
| CB-02 | Switch geral no tenant e override por grupo em três estados (`inherit`, `off`, `custom`), permitindo campanha pontual sem mexer no padrão. |
| CB-03 | Crédito calculado sobre a base configurada e lançado ao **responsável da inscrição**, não rateado entre a família. |
| CB-04 | Liberação após o término da saída, conforme `cashback_release_days`. Saída cancelada não gera crédito. |
| CB-05 | Resgate aplicado como lançamento negativo na inscrição — nunca alterando o valor congelado do participante. |
| CB-06 | Teto de resgate por inscrição, para o cashback não zerar uma venda. |
| CB-07 | Validade configurável, com entrada `expiry` automática no vencimento e aviso ao cliente antes disso. |
| CB-08 | Extrato e saldo na ficha do cliente e no portal, sempre derivados de `cashback_entries`. |
| CB-09 | **A regra vigente é congelada na inscrição.** Mudar o percentual amanhã não altera o crédito de uma saída de ontem. |

> **Por que CB-09:** cashback é passivo — dinheiro que a empresa deve ao cliente. Recalcular crédito antigo quando a configuração muda gera saldo que não bate com o que o cliente viu, e é o mesmo raciocínio do snapshot de preço em §3.5.

> **Por que crédito ao responsável (CB-03):** é ele quem paga e quem contrata. Ratear entre a família cria saldo em conta de criança de 6 anos, que não tem login nem como resgatar.

### 5.9 Comunicação

| ID | Requisito |
|---|---|
| CM-01 | Push nativo via Capacitor Push Notifications + FCM (Android) e APNs (iOS), com tokens em `push_tokens`. |
| CM-02 | Campanhas de e-mail com segmentação: participou do roteiro X, não viaja há N meses, tem cashback vencendo, está inscrito no grupo Y. |
| CM-03 | Agendamento de envio via `pg_cron` + Edge Function. |
| CM-04 | Consentimento por canal em `communication_consents`, com opt-out de um clique e base legal registrada (LGPD). |

Envio de e-mail delegado a provedor (Resend ou Brevo). Entregabilidade é problema de reputação de IP, fora do escopo do produto.

### 5.10 Configurações

| Seção | Conteúdo |
|---|---|
| **Empresa** | Nome, CNPJ, **logo**, endereço, telefone, valores e faixas etárias padrão, limite de acompanhantes |
| **Documentos** | Editor de texto rico para o Termo de Adesão, com versionamento e histórico de aceites (§5.13) |
| **Veículos** | Catálogo de marcas e modelos + fila de itens "Outro" aguardando catalogação |
| **Integrações** | API keys (criar, listar, revogar, escopos), endpoint de inscrições, mapa `form_id` → roteiro, log de eventos recebidos, e-mail, push |
| **Conta** | Usuários, papéis, perfil, senha |

| ID | Requisito |
|---|---|
| CF-01 | Identidade da empresa editável pela equipe (owner/admin): razão social, CNPJ e **logo**. O CNPJ é validado; logo aceita PNG ou JPG. |
| CF-02 | A logo aparece no **cabeçalho da roomlist** (GR-15) e na **marca da navegação**. Sem logo, a navegação mostra as iniciais do tenant, como hoje. |
| CF-04 | **Veículo do condutor** (marca, modelo e placa), junto do cadastro dele, para abrir a lista do comboio (GR-17). Placa validada nos formatos antigo e Mercosul (CL-05). |
| CF-05 | **Condutor da empresa** em Configurações → Equipe: nome, CPF, nascimento, contato, endereço, veículo e acompanhantes. É quem abre a roomlist (GR-15) e o comboio (GR-17). Não é cliente — não tem inscrição, não paga e não gera cashback —, por isso vive na configuração do tenant e não no cadastro de clientes. |
| CF-03 | A logo é guardada **junto da configuração do tenant**, já convertida e redimensionada, não como arquivo em bucket. |

> **Por que a logo não vai para o Storage (CF-03):** o único consumidor que não é tela é o gerador de PDF, que roda no **servidor** — e o servidor não fala com o Storage (o upload de fotos é todo do navegador, com a RLS do bucket como guarda). Mandar a logo para um bucket obrigaria a dar ao servidor uma chave de serviço, que é poder demais para uma imagem de 40 KB, e a fazer um download HTTP a cada documento gerado. Guardada com a configuração, o servidor já a tem em mãos na mesma leitura que faz do nome e do CNPJ. É a exceção que a regra de §5.12 (foto de comunidade e de roteiro em bucket privado) não cobre: aquelas são muitas, grandes e do cliente; esta é uma, pequena e da empresa.

### 5.11 Portal do cliente

O portal é a visão do próprio cliente dentro do sistema — mesma base de dados, mesma RLS, audiência diferente.

**Acesso**

| ID | Requisito |
|---|---|
| PC-01 | Conta criada automaticamente ao cadastrar cliente elegível (maior de 18 com e-mail próprio), com magic link de convite. |
| PC-02 | Login por magic link, sessão persistente, senha própria opcional definida depois pelo cliente. |
| PC-03 | Rate limiting no envio de link, por e-mail e por IP. |
| PC-04 | Reenvio de convite e desativação de acesso a partir da ficha do cliente no back-office. |
| PC-05 | Cliente nunca acessa custo de fornecedor, margem, nem dado de outra família — garantido por RLS, não por rota. |

**Meus dados**

| ID | Requisito |
|---|---|
| PC-06 | Edição livre de contato, endereço e veículo. |
| PC-07 | **Nome, CPF e data de nascimento não são livremente editáveis.** Alteração entra em fila de aprovação no back-office. |
| PC-08 | Cliente gerencia os dados dos próprios acompanhantes e pode cadastrar acompanhante novo (nome, CPF, nascimento), criando o cliente vinculado à família. |

> **Por que PC-07:** data de nascimento define a faixa etária e, com ela, o preço. CPF é chave de identidade e sai na nota fiscal. Deixar os três abertos permite que alguém rebaixe um adulto para "criança 6–10" antes de se inscrever, ou quebre a nota. Contato e endereço não têm esse efeito e ficam livres.

**Minhas expedições**

| ID | Requisito |
|---|---|
| PC-09 | Histórico de expedições realizadas, com fotos do roteiro e link para os próprios posts na comunidade. |
| PC-10 | Expedições futuras confirmadas, com datas e composição da família inscrita. |
| PC-11 | Extrato financeiro da própria família: valor total, pagamentos realizados, saldo a pagar e status de NF. |
| PC-12 | Extrato e saldo de cashback, com vencimentos à vista. |

**Inscrição em 1 clique**

| ID | Requisito |
|---|---|
| PC-13 | Vitrine das saídas abertas: roteiro, datas, descrição, fotos e vagas restantes. |
| PC-14 | Botão de inscrição abre uma tela única já preenchida com o responsável e o veículo do cadastro. |
| PC-15 | A família aparece em lista com checkbox — **o único passo obrigatório é marcar quem vai.** |
| PC-16 | Preço recalculado ao vivo a cada marcação, mostrando a composição (base casal ou solo + adicionais) conforme §3.4. |
| PC-17 | Idade de cada acompanhante calculada na data de início da saída, com a categoria exibida ao lado do nome. |
| PC-18 | Cadastrar acompanhante novo sem sair do fluxo. |
| PC-19 | Inscrição pelo portal entra sempre como `pending`. Não existe confirmação automática. |
| PC-20 | Vitrine só bloqueia a inscrição quando a saída tem limite definido **e** as confirmadas já preencheram as vagas. |
| PC-21 | Inscrição criada pelo portal grava `source: portal`, com preços congelados no ato como qualquer outra. |
| PC-22 | A tela deixa explícito que **a vaga só é garantida após o primeiro pagamento**, antes de o cliente confirmar o envio. |
| PC-23 | Cliente recebe "inscrição recebida" no envio, com as instruções de pagamento, e "inscrição confirmada" quando a equipe lançar o primeiro recebimento. |
| PC-24 | Equipe recebe push de nova inscrição pendente. |

**Confirmação vem sempre pelo dinheiro.** Toda inscrição — portal, webhook ou cadastro manual — nasce em `pending`. O que a confirma é o **primeiro recebimento**, integral ou parcial: lançado à mão pela equipe, ou pelo gateway quando a cobrança é paga (§5.14). O que não existe é confirmação sem dinheiro — a exceção manual segue exigindo motivo.

Fila de pendentes no back-office, visível no dashboard e por push.

### 5.14 Gateway de pagamento (ASAAS)

Cobrança emitida a partir da inscrição, e recebimento que entra sozinho quando o cliente paga. **Não substitui o lançamento manual**: o que for pago fora do gateway continua sendo registrado à mão.

| Id | Requisito |
|---|---|
| PG-01 | Conexão por tenant e por ambiente (sandbox e produção, chaves separadas). A chave é validada no provedor antes de ser guardada, e guardada **cifrada** — nenhuma resposta de API a devolve. Conectar e desconectar exigem owner ou admin. |
| PG-02 | Emissão de cobrança (pix, boleto ou cartão) para uma inscrição, com vencimento e valor — por padrão, o que falta pagar. Emitir **não** mexe no ledger. |
| PG-03 | Webhook do provedor autenticado por segredo próprio, gerado ao conectar. Pagamento recebido vira lançamento no ledger e confirma a inscrição (IN-08); reenvio do mesmo evento não duplica o recebimento; evento desconhecido responde 200 sem efeito. |
| PG-04 | O valor da cobrança é o **líquido**: o bruto cobrado do cliente cobre as taxas do provedor. A taxa da transação é consultada no provedor (PG-05); a antecipação é configurada por tenant, em % ao mês, e entra pelo prazo médio das parcelas. Bruto e líquido ficam guardados na cobrança. |
| PG-05 | A taxa da transação é **perguntada ao provedor** a cada cobrança, já na faixa de parcelas do plano contratado — não é digitada nem mantida à mão. A prévia da tela usa o mesmo caminho da emissão. |
| PG-06 | Toda cobrança emitida fica registrada na inscrição e no financeiro, com o que o cliente paga e o que deve sobrar. Cobrança **não entra na receita** — receita é o recebimento; a taxa do provedor é informação, não despesa lançada. |
| PG-07 | Conciliação por cobrança: o sistema pergunta ao provedor quantas parcelas foram pagas, quanto o cliente pagou e quanto foi **creditado de fato** (com taxas e antecipação), e guarda ao lado do esperado. É conferência, não lançamento. |
| PG-08 | O recebimento entra no ledger pelo **valor da inscrição**, não pelo bruto cobrado: uma cobrança no cartão gera **um** lançamento, porque a venda é aprovada inteira e as parcelas são o mesmo dinheiro chegando em pedaços. Boleto e pix parcelados quitam proporcionalmente, parcela a parcela. O bruto pago pelo cliente fica guardado ao lado. |
| PG-09 | Lançamento manual de pix, boleto ou cartão entra no ledger **líquido da taxa do provedor** — é o que cai na conta. Dinheiro entra integral. Sem conta conectada, ou sem resposta do provedor, o lançamento entra integral. |

O que **não** muda: saldo continua derivado do ledger, o valor congelado do participante não é tocado, e cancelamento/devolução seguem o caminho de §3.6.

### 5.15 Cupons de desconto

Código promocional que abate valor de uma inscrição. Nasce no back-office — a equipe cria o cupom e aplica na inscrição —, desenhado para a auto-inscrição do cliente pelo app plugar depois, sem mudança de banco.

**O desconto é linha própria, não preço novo** (§3.4). O snapshot do participante continua sendo o que a tabela de preços dizia no dia; o cupom entra ao lado, e o contratado é a diferença. É isso que mantém a resposta para "quanto era" e "por que ficou menos" separadas.

**O uso é um lançamento, não um contador.** Quantas vezes um cupom foi usado é `COUNT` dos resgates ativos, nunca uma coluna incrementada — mesmo raciocínio de saldo em §3.6. Cancelar a inscrição devolve o uso.

| Id | Requisito |
|---|---|
| CP-01 | Cupom por tenant: código único, desconto **percentual ou valor fixo**, ativo/inativo e janela de validade opcional (de/até). |
| CP-02 | Escopo opcional: válido só para um roteiro **ou** só para uma saída. Sem escopo, vale para qualquer inscrição do tenant. |
| CP-03 | Nominal opcional: cupom emitido para um cliente específico; o responsável de outra inscrição não consegue aplicá-lo. |
| CP-04 | Limite de usos **total** e **por cliente**, contados sobre resgates ativos. Sem limite declarado, uso livre. |
| CP-05 | O desconto **não altera o valor congelado do participante** (§3.4): entra como linha própria e o contratado da inscrição passa a ser a soma dos unitários menos o desconto. |
| CP-06 | Um cupom por inscrição. Aplicar e remover exigem owner ou admin e vão para a trilha de auditoria (§3.2.1). |
| CP-07 | Aplicar não pode deixar o contratado **abaixo do já recebido** — desconto não cria devolução por acidente. |
| CP-08 | Cancelar a inscrição, ou remover o cupom, **devolve o uso** ao cupom. |
| CP-09 | Cashback calculado sobre o contratado **já com desconto** — não se paga crédito sobre dinheiro que não entrou. |
| CP-10 | O desconto é **congelado no resgate**: desativar, editar ou expirar o cupom depois não muda inscrição que já o usou. |

> **Por que CP-07:** o desconto chega depois do dinheiro em boa parte dos casos reais (o cliente pede na hora de fechar). Sem a guarda, aplicar um cupom numa inscrição já paga produziria saldo negativo, que o sistema leria como "a empresa deve" — devolução silenciosa que ninguém decidiu. Com a guarda, o caminho da devolução continua sendo o explícito de §3.6.

> **Por que CP-10:** é o mesmo argumento de CB-09 e do snapshot de preço. Campanha é passado assim que foi usada; recalcular desconto antigo quando o cupom muda faria a inscrição de ontem mudar de valor sozinha.

### 5.12 Comunidade

Feed do tenant onde os clientes publicam suas aventuras.

**Comunidade fechada.** Não há visualização pública nem por link. Só entra quem tem conta, e só tem conta quem está cadastrado — seja por ter se inscrito numa expedição, seja por cadastro manual do admin. Não é exigido ter viajado: cadastro ativo basta para ler, postar, curtir e comentar.

| ID | Requisito |
|---|---|
| CO-01 | Post é **foto com legenda**: de 1 a 10 fotos obrigatórias, legenda de até **2.000 caracteres**. Post sem foto não é aceito. |
| CO-02 | Post pode ser opcionalmente vinculado a um **roteiro** ou a um **grupo** de que o autor participou — habilita filtro "aventuras na Coxilha Rica" e alimenta a página do roteiro. |
| CO-03 | Feed com ordenação cronológica, filtro por roteiro e paginação. |
| CO-04 | Curtidas e comentários, com atualização ao vivo via Supabase Realtime. Comentário de até 1.000 caracteres. |
| CO-05 | Push para o autor quando alguém curte ou comenta. |
| CO-06 | Autor pode editar e excluir os próprios posts e comentários (soft delete). |
| CO-07 | **Post publica direto**, sem aprovação prévia. A moderação é reativa. |
| CO-08 | A equipe vê fila de denúncias, pode ocultar post ou comentário com motivo, e pode suspender a publicação de um cliente. |
| CO-08 | Denúncia por qualquer cliente autenticado, gerando entrada em `post_reports`. |
| CO-09 | Upload de mídia para Supabase Storage com path por tenant, dentro dos limites da tabela abaixo, com compressão no cliente antes do envio e geração de thumbnail. |
| CO-10 | **Consentimento de uso de imagem** registrado em `media_consents` no aceite dos termos da comunidade, com revogação disponível. |
| CO-11 | Curadoria: a equipe pode marcar posts como destaque para exibir na página do roteiro. |

Três pontos que não são opcionais aqui:

#### Limites de conteúdo e mídia

| | Regra |
|---|---|
| Fotos por post | 1 a **10** — obrigatório ao menos uma |
| Legenda | até **2.000** caracteres |
| Comentário | até **1.000** caracteres |
| Tamanho aceito no upload | 15 MB por foto |
| Formatos | JPG, PNG, HEIC, WebP |
| Processamento | redimensiona para 2560 px no maior lado, converte para WebP q80 |
| Guardado | ~400 KB por foto |
| Thumbnail | 480 px WebP |

**Vídeo fica fora por enquanto.** `post_media.kind` já existe no schema para quando entrar, mas o upload no v1 aceita apenas imagem.

**A compressão acontece no cliente, antes do upload.** Foto de celular hoje sai com 4–8 MB; dez delas são 60 MB por post. Comprimir no navegador derruba isso para uns 4 MB, o que muda três coisas de uma vez: custo de Storage, tempo de upload em 4G no meio da estrada, e velocidade do feed.

Ordem de grandeza para calibrar: 200 posts por mês, com dez fotos cada, dão cerca de 800 MB/mês de armazenamento acumulado.

HEIC precisa de conversão no cliente — iPhone entrega nesse formato por padrão e o navegador não renderiza. Sem isso, metade dos posts sobe e não aparece.

**Moderação é requisito, não feature de v2.** No momento em que clientes publicam mídia, o tenant passa a hospedar conteúdo de terceiros. Sem fila de denúncia e botão de remover, o primeiro problema vira problema jurídico.

**Direito de imagem.** Foto de expedição contém outras famílias e crianças. O aceite dos termos da comunidade precisa cobrir uso da própria imagem, e a moderação precisa poder remover a pedido de terceiro — inclusive de quem não é usuário do sistema.

**Escopo do feed.** A comunidade é **por tenant**: cliente da Drakkar vê a comunidade da Drakkar. Um feed cross-tenant seria outro produto, com outro modelo de privacidade, e fica fora do v1.

### 5.13 Termo de adesão

**Um documento só, um aceite só.** Editor de texto rico em **Configurações → Documentos**, onde o admin escreve o Termo de Adesão completo — regras do serviço, cancelamento, dados, direito de imagem, foro. É o formato que a Drakkar já usa hoje na ficha de inscrição, com 16 cláusulas num texto contínuo.

Fragmentar em política de privacidade, termos da comunidade e regulamento separados criaria uma sequência de aceites que derruba conversão sem ganho jurídico correspondente. A LGPD exige **informar**, não exige aceite separado por assunto.

**Onde o aceite acontece**

| Origem do cliente | Momento |
|---|---|
| Inscrição pelo site | `aceite: "1"` no payload (§5.7.1), vinculado à versão vigente no envio |
| Inscrição pelo portal | Checkbox no fluxo de 1 clique |
| Cadastro manual pelo admin | Primeiro login no portal, bloqueando o acesso até aceitar |

Um registro por cliente e por versão. Quem já aceitou não vê a tela de novo.

**A exceção que precisa ficar de fora do texto: marketing.**

O termo atual reúne na cláusula 13 a manutenção de cadastro, o envio de convites, as ações de marketing e o compartilhamento com parceiros, tudo sob o mesmo "ao preencher o formulário o aderente concorda". O Art. 8º, §4º da LGPD determina que o consentimento se refira a finalidades determinadas e que **autorizações genéricas sejam nulas** — e consentimento embutido na aceitação de contrato não é livre, porque a pessoa não pode recusar sem perder o serviço.

Consequência prática, e ela é barata: **um checkbox separado**, no mesmo formulário, desmarcado por padrão.

```
[x] Li e aceito o Termo de Adesão          ← obrigatório, contrato
[ ] Quero receber convites e novidades      ← opcional, marketing
```

Não é outro documento nem outra tela — é uma linha a mais. O que o termo cobre por execução de contrato (cadastro, reservas, compartilhamento com os parceiros da viagem, nota fiscal) continua dentro dele e não precisa de consentimento. Só a comunicação promocional sai. Sem essa separação, a base do marketing inteiro fica frágil, e é justamente a base de que a campanha de e-mail (§5.9) depende.

**Versionamento**

- Rascunho editável à vontade; **publicar congela a versão**, que passa a ser imutável
- Cada versão guarda número, conteúdo, quem publicou, quando e um resumo das mudanças
- Ao publicar, o admin marca se a mudança **exige novo aceite**. Exigindo, o portal bloqueia no próximo acesso; não exigindo, a versão vale para os aceites seguintes
- Versão com aceite vinculado nunca é apagada

Sem versionamento, o aceite não prova nada: bastaria editar o texto depois para que todos os aceites anteriores apontassem para algo que ninguém leu. O ônus da prova do consentimento é do controlador.

**Registro do aceite**

```
document_acceptances: customer_id, document_version_id, booking_id?,
                      accepted_at, channel, ip, user_agent, pdf_path
```

**Variáveis no texto.** Marcadores substituídos na renderização: `{{cliente_nome}}`, `{{cliente_cpf}}`, `{{roteiro}}`, `{{data_inicio}}`, `{{data_fim}}`, `{{participantes}}`, `{{valor_total}}`, `{{empresa_nome}}`, `{{empresa_cnpj}}`. É o que faz o termo funcionar como contrato daquela inscrição, com os dados reais dentro.

**PDF congelado no aceite.** No ato do aceite, o sistema renderiza o termo com as variáveis resolvidas e guarda o PDF em Storage, anexado à inscrição, visível no back-office e no portal. Como o termo atual declara que "o formulário de inscrição e a apresentação do passeio fazem parte do nosso contrato", o PDF inclui também os dados da inscrição e o resumo do roteiro — incorporando por referência o que hoje está espalhado entre três páginas do site.

**Armazenamento e segurança do conteúdo**

Conteúdo em **Markdown**, com HTML renderizado e sanitizado por allowlist na gravação e na exibição. Decisão de 2026-09-01, fechada a favor do que foi construído: o renderizador escapa todo HTML **antes** de introduzir tags conhecidas, então é seguro por construção — nunca aceita HTML cru. Um editor rico de HTML (ProseMirror/TipTap) traria WYSIWYG e, junto, uma superfície de XSS armazenado para vigiar.

> Editor rico é vetor clássico de XSS armazenado, e "só o admin escreve" não é defesa num sistema multi-tenant: o admin de um tenant escreve conteúdo que os clientes dele leem, e um `<script>` colado junto com texto do Word vira execução na sessão de quem abrir.

| ID | Requisito |
|---|---|
| DOC-01 | Editor de texto rico em Configurações → Documentos, com rascunho e publicação, para um único Termo de Adesão. |
| DOC-02 | Versionamento imutável: publicar congela a versão; edição posterior gera versão nova. |
| DOC-03 | Marcação de "exige novo aceite" na publicação, bloqueando o portal até o cliente aceitar. |
| DOC-04 | Aceite único por cliente e versão, capturado na inscrição ou no primeiro login. |
| DOC-05 | Registro com versão, data, canal, IP e user agent. |
| DOC-06 | Checkbox de marketing separado e desmarcado por padrão, gravado em `communication_consents`. |
| DOC-07 | Variáveis substituídas na renderização, com pré-visualização usando dados de exemplo. |
| DOC-08 | PDF congelado no aceite, anexado à inscrição e visível no portal. |
| DOC-09 | Conteúdo em JSON estruturado + HTML sanitizado por allowlist na gravação e na renderização. |
| DOC-10 | Versão com aceite vinculado nunca é excluída. |


---

### 5.16 Funil de oportunidades

O que existe hoje começa na inscrição. Quem chama no WhatsApp perguntando da Coxilha Rica,
recebe o preço e some **não deixa rastro nenhum** — e é exatamente essa pessoa que um funil
existe para acompanhar. O §5.7.2 reconhece a conversa comercial numa linha ("WhatsApp →
conversa → formulário") e a trata como acontecendo fora do sistema.

| ID | Requisito |
|---|---|
| OP-01 | **Etapas configuráveis pelo tenant**: criar, renomear, reordenar e arquivar. Cada etapa tem um `kind` — `open`, `won` ou `lost`. |
| OP-02 | Tenant novo nasce com etapas padrão. Quadro que nasce vazio não é usado: a primeira tela precisa mostrar como a coisa funciona. |
| OP-03 | Oportunidade exige **nome do contato** e mais nada. Telefone, e-mail, roteiro de interesse e valor previsto são opcionais. Pedir CPF aqui seria repetir o erro que o §3.2 evita no formulário: atrito onde ainda não há compromisso. |
| OP-04 | Criação manual pela tela, e automática a partir de uma conversa (AT-10). |
| OP-05 | Mover entre etapas. **O movimento vai para a trilha** (`audit_log`, entidade `opportunity`): quem moveu, quando, de qual etapa para qual. Sem isso não há como responder "por que essa venda parou". |
| OP-06 | **Arquivar etapa é bloqueado enquanto houver oportunidade nela** — o caminho é mover as oportunidades antes. Mesma regra da categoria de fornecedor (FO-05), pelo mesmo motivo: sumiço em silêncio. |
| OP-07 | Marcar como perdida **exige motivo**. Perda sem motivo é dado que não ensina nada depois. |
| OP-08 | **Fechar gera a inscrição, e nunca sozinho.** A equipe escolhe o grupo; o cliente é criado ou reaproveitado por CPF (IN-03); a oportunidade guarda o `booking_id` e para de se mover. O CPF é pedido **neste momento**, que é quando existe compromisso para justificá-lo. |
| OP-09 | **Oportunidade não entra em nenhum relatório financeiro.** `expected_value_cents` é previsão, não caixa — aparece só no funil, sempre rotulado como previsto, e nunca somado a valor recebido, contratado ou em aberto (§3.6). |
| OP-10 | Exclusão lógica (`deleted_at`). Oportunidade que virou inscrição nunca é apagada. |
| OP-11 | **Só a equipe.** O cliente não vê funil, não vê etapa e não sabe que existe. `viewer` lê e não move. |

> **Por que a oportunidade não é uma inscrição em outro estado.** Seria mais barato reusar
> `bookings` com um estado a mais, e seria errado por três motivos. A inscrição exige grupo, e
> a maior parte das conversas morre antes de existir data escolhida. A inscrição exige CPF, e
> pedir CPF para responder um preço afasta a venda. E a inscrição é o começo do rastro
> financeiro — encher a tabela de inscrições com gente que nunca fechou contamina o número que
> o §3.6 existe para manter confiável.

---

### 5.17 Atendimento (WhatsApp · Instagram · Messenger)

Hoje a equipe **sai do produto** para conversar: o sistema abre um link `wa.me` e volta para
marcar `phone_verified_at` na mão (§5.7.2). A conversa em si — o que foi combinado, o preço que
foi dado, quem respondeu — não existe em lugar nenhum.

| ID | Requisito |
|---|---|
| AT-01 | Conexão de canal por tenant, em Configurações → Integrações, no mesmo molde do gateway (§5.14): o segredo que precisa voltar em claro é **cifrado**; o que só se compara é **hasheado**. O segredo aparece **uma vez**, no ato de conectar. |
| AT-02 | Webhook por provedor, autenticado pelo segredo. **Slug desconhecido e segredo errado respondem igual (401)** — a diferença enumera os tenants da plataforma (SEC). |
| AT-03 | **Idempotência pelo id da mensagem no provedor.** Todos reenviam até receber `200`; mensagem repetida não vira linha nova. |
| AT-04 | O corpo cru do webhook é guardado em `payload`, como o intake faz (IN-01), e **nunca vai para o log da aplicação** — mensagem é conteúdo pessoal. |
| AT-05 | A conversa é identificada por `(canal, id externo)`. Instagram e Messenger entregam um id opaco por aplicativo, não telefone nem e-mail: **casar por identidade real é impossível nesses canais, e fingir que dá é o caminho para misturar duas pessoas**. |
| AT-06 | No WhatsApp, tenta casar o telefone com um cliente existente e vincula. Não achou, a conversa fica solta. **Nunca cria cliente sozinho** (§5.7.2: auto-merge silencioso corrompe a base). |
| AT-07 | **Caixa compartilhada**: toda a equipe vê e responde qualquer conversa. Conversa parada porque o dono dela está na estrada é pior que conversa sem dono. |
| AT-08 | Toda mensagem enviada grava **quem da equipe respondeu**. É o que a caixa compartilhada troca pela atribuição. |
| AT-09 | A caixa atualiza ao vivo, sem recarregar. |
| AT-10 | Anexar uma conversa a uma oportunidade — existente ou criada ali, com o nome já preenchido pelo canal. É a ponte entre §5.16 e §5.17. |
| AT-11 | **O cliente não vê a caixa.** O portal (§5.11) não ganha chat nesta fase; as tabelas nascem sem policy de cliente. |
| AT-12 | Na Meta, mensagem livre só nas **24h** após a última mensagem da pessoa. Fora da janela, a tela recusa e explica — regra de negócio visível, não erro de API traduzido. |
| AT-13 | Mídia (foto, áudio, documento) chega numa fase posterior: exige baixar do provedor **no servidor** e guardar em bucket privado por tenant, caminho diferente do upload pelo navegador que existe hoje (CO-09). Até lá, mensagem com mídia mostra que veio mídia e não o conteúdo. |

> **Um port, quatro provedores.** WhatsApp pela Evolution API (auto-hospedada) e Instagram e
> Messenger pela Graph API da Meta são adaptadores diferentes de um mesmo port de mensageria
> (§10.1). O domínio conhece conversa e mensagem; não conhece Evolution nem Meta. É o que
> permite trocar a Evolution pela API oficial do WhatsApp sem tocar em regra de negócio — e
> essa troca é previsível, porque número pareado por QR pode ser bloqueado.

---

## 6. Fora de escopo no v1



Emissão automática de NFS-e (só o gancho fica previsto) · conversão multi-moeda · uso offline · comunidade cross-tenant · **mensagem direta entre clientes** (segue fora: o §5.17 abre equipe ↔ pessoa de fora, nunca cliente ↔ cliente) · **chat no portal do cliente** (AT-11) · **mídia nas conversas** (AT-13) · **editor de campos personalizados** (as colunas `jsonb` e a tabela de definição entram desde já; a tela de edição espera o segundo tenant, §3.8) · **formulário público hospedado** — o tenant mantém o próprio front (§5.7.1) · publicação nas lojas antes do sistema estar em uso real.

---

## 7. Roadmap

| Fase | Entrega | Critério de pronto |
|---|---|---|
| 0 | Tenancy, auth, RLS, Prisma extension, schema, seed do catálogo, harness de testes e CI | Suíte de RLS provando isolamento entre tenants, rodando no CI |
| 1 | Clientes e famílias, fornecedores, roteiros, configurações | Catálogo de veículos e roteiros semeados; cadastro de um cliente real ponta a ponta |
| 2 | Agenda + grupos + inscrição manual | Uma saída real montada ponta a ponta |
| 3 | Financeiro: recebimentos, gastos, pagamentos, NF, margem | Uma saída fechada sem planilha |
| 4 | Webhook + fila de revisão | Inscrição real entrando sozinha e correta |
| 5 | Históricos consolidados + cashback | Extrato do cliente batendo com o ledger |
| 6 | Push + e-mail marketing | Primeira campanha enviada |
| 7 | Portal do cliente: magic link, meus dados, minhas expedições, extrato, inscrição em 1 clique | Primeiro cliente se inscrevendo sozinho numa saída |
| 8 | Comunidade: feed de fotos, curtidas, comentários, moderação | Primeiro post publicado e fila de moderação funcionando |
| 9 | Empacotamento Capacitor (Android → iOS) | App instalado e em uso |

**Métrica de sucesso do v1:** fechar uma expedição inteira — inscrições, recebimentos, fornecedores, NF, margem — sem abrir uma planilha.

---

## 8. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Prisma furando isolamento de tenant | Vazamento entre clientes no dia do SaaS | Client extension + RLS + teste desde a fase 0 |
| Saldo desincronizado do ledger | Perda de confiança no financeiro | Saldo sempre derivado |
| Webhook sujo corrompendo a base | Duplicatas e retrabalho | Staging + fila de revisão + merge de clientes |
| Webhook sem autenticação | Injeção de inscrição falsa por quem descobrir a URL | API key com escopo, conferida antes de gravar; HMAC opcional por cima |
| API key vazada em repositório ou log | Acesso indevido à inscrição do tenant | Prefixo identificável para varredura, hash no banco, mascaramento em log, revogação individual imediata |
| `external_id` não único por origem | Inscrição válida descartada como duplicata, em silêncio | Campo opcional; quando enviado, id sequencial precisa ser composto. Deduplicação real por `(group_ref, cpf)` + constraint em `bookings` |
| Campos personalizados virando muleta | Regra de negócio dependendo de `jsonb` sem tipo nem índice | `custom_fields` restrito a exibição, filtro e exportação — nunca a cálculo |
| Origem externa divergindo do contrato | Inscrição rejeitada ou campo perdido sem ninguém notar | Perfil de mapeamento por `source`; `422` com o campo culpado; campo desconhecido vira aviso na fila, não erro |
| Fila de alocação acumulando | Cliente inscrito sem saída definida, esperando resposta | Contador na home, alerta de item parado, ordenação por tempo de espera |
| Reajuste reescrevendo o passado | Histórico inconsistente | Preços versionados + snapshot no participante |
| Catálogo de veículos crescendo por texto livre | Sujeira ("SW4", "sw4", "Hilux SW4") | Fila de catalogação com merge |
| LGPD (CPF, marketing) | Exposição legal | Consentimento por canal, mascaramento, audit log |
| Transferência internacional sem base formalizada | Sanção da ANPD, independente de ter havido vazamento | CPCs nos contratos de subprocessador, base registrada por finalidade, transferência declarada no aviso de privacidade |
| Inscrição pendente acumulando sem triagem | Cliente esperando resposta e receita projetada irreal | Fila de pendentes no dashboard, push por nova inscrição, alerta de pendência parada |
| Cliente achando que a vaga está garantida ao se inscrever | Conflito na última vaga e desgaste com o cliente | Aviso explícito no envio (PC-22) e no e-mail de recebimento |
| Cliente editando data de nascimento ou CPF | Manipulação de faixa de preço e nota fiscal errada | Campos sensíveis via fila de aprovação (PC-07) |
| RLS de cliente mal escrita | Cliente enxergando custo de fornecedor, margem ou outra família | Policies separadas por `role = customer` + teste automatizado por audiência |
| Conteúdo impróprio ou de terceiros na comunidade | Problema jurídico e de imagem da marca | Fila de denúncia, remoção com motivo, suspensão de publicação, consentimento de imagem |
| Custo de Storage com mídia da comunidade | Conta crescendo sem controle | Limite de tamanho e quantidade por post, compressão e thumbnail no upload |

---

## 9. Pendências

Nenhuma pendência bloqueante para iniciar a fase 0.

O formulário atual do site será substituído. Alergia, restrição alimentar, Instagram e perfil off-road do veículo saem de escopo; o novo formulário emite apenas o núcleo definido em §5.7.1, com os campos de acompanhante além de nome, CPF e nascimento marcados como opcionais.

Único ajuste externo previsto: o formulário precisa emitir os campos de acompanhante na convenção definida em §5.7.1 — `acomp_1_nome`, `acomp_1_cpf`, `acomp_1_nascimento`, `acomp_2_nome`, e assim por diante. O parser varre as chaves que casam com `acomp_\d+_*`, então acrescentar ou remover acompanhante não exige mudança no sistema.

---

## 10. Padrões de engenharia

Duas exigências inegociáveis do projeto: **código simples e legível** e **TDD em toda feature**. Esta seção traduz as duas em regras verificáveis, porque princípio sem regra concreta não sobrevive ao terceiro sprint.

### 10.1 Arquitetura em camadas

```
domínio        regras de negócio puras · sem I/O · sem Prisma · sem React
aplicação      casos de uso · orquestra transação, repositório, evento
infraestrutura Prisma, Supabase, Storage, e-mail, push
interface      React, rotas HTTP, webhook
```

A dependência aponta sempre para dentro. Domínio não sabe que Prisma existe.

**O coração deste sistema é um punhado de funções puras:**

```
resolvePriceCategory(birthDate, groupStartDate, ageBands) → PriceCategory
calculateBookingTotal(participants, priceTable)          → Cents
calculateCashback(paidAmount, rule)                       → Cents
projectBalance(entries)                                   → Cents
mapWpFlatPayload(rawBody)                                 → NormalizedIntake
```

Entrada e saída, sem banco e sem data corrente escondida. É onde mora o dinheiro do negócio e é o que precisa ser trivial de testar. Se testar uma dessas exigir subir Postgres, a fronteira foi violada.

### 10.2 Regras de código

| Regra | Por quê |
|---|---|
| Um caso de uso por arquivo, nomeado pelo que faz (`allocateIntake.ts`, `registerPayment.ts`) | Achar código pelo nome do requisito, não caçando em `services.ts` de 900 linhas |
| **Zero lógica de negócio em componente React** — componente renderiza, hook chama caso de uso | Regra em componente não é testável sem DOM e some do radar |
| Dinheiro sempre em centavos, tipo `Cents` (branded type), nunca `number` solto | Impede somar reais com centavos sem o compilador reclamar |
| Datas: `Date` só nas bordas; no domínio, `LocalDate` explícito | Fuso é a origem clássica de erro de faixa etária |
| Validação nas bordas com Zod — webhook, formulário, API. *Parse, don't validate* | Depois da borda, o tipo é verdade e ninguém revalida |
| Sem herança. Composição e função | Hierarquia de classe é a abstração que mais atrapalha manutenção solo |
| Sem abstração especulativa — só generaliza na terceira repetição | Abstrair no segundo caso quase sempre abstrai o eixo errado |
| Função até ~40 linhas, arquivo até ~300 | Limite arbitrário que funciona: força extração antes do arquivo virar sedimento |
| `catch` sem tratamento é proibido; erro de negócio é tipo, não string | Erro engolido em sistema financeiro vira divergência silenciosa |
| Nomes de domínio seguem o glossário do §3.1 | O PRD já fixou `itinerary`, `group`, `booking`, `participant`. Traduzir de novo no código cria dois vocabulários |

**O que "simples" quer dizer aqui:** código chato, previsível, que a próxima pessoa entende sem contexto — e essa próxima pessoa é você daqui a oito meses. Esperteza que economiza cinco linhas e custa vinte minutos de leitura é prejuízo.

### 10.3 TDD

**O teste vem primeiro. Sem exceção.**

O ciclo é red-green-refactor, nessa ordem, e cada etapa tem um critério objetivo:

1. **Red** — escreve o teste descrevendo o comportamento esperado e **roda para vê-lo falhar**. Teste que passa de primeira não está testando o que se pensa: ou o comportamento já existia, ou a asserção está errada. Ver o vermelho é a verificação de que o teste tem valor.
2. **Green** — implementa o mínimo para o teste passar. Nada além.
3. **Refactor** — limpa com a suíte verde protegendo, aplicando §10.2.

Não existe implementação sem teste vermelho antes. Código escrito primeiro e testado depois não é TDD — é código com teste, e o teste nesse caso descreve o que foi feito em vez de o que deveria ser feito, incluindo os erros.

**Pirâmide para este sistema**

| Camada | Peso | O que cobre | Ferramenta |
|---|---|---|---|
| Unitário | maioria | Domínio puro: preço, faixa etária, cashback, saldo, parser de payload, validação de CPF e placa | Vitest |
| Integração | médio | Repositórios contra **Postgres real**, transações, constraints, triggers | Vitest + Supabase local ou Testcontainers |
| **RLS** | categoria própria | Isolamento entre tenants e entre audiências | Vitest, uma sessão por papel |
| E2E | poucos | Fluxos que dão prejuízo se quebrarem | Playwright |

**Nunca mockar o banco.** Mock de ORM passa verde enquanto o SQL real falha por constraint, cascade ou índice parcial. Metade das regras deste PRD vive em constraint e trigger — `UNIQUE (group_id, responsible_customer_id)`, hierarquia de dois níveis da família, RLS. Teste que mocka Prisma não toca nada disso.

**Testes de RLS são obrigatórios, não bônus.** No mínimo:

- tenant A não lê nenhuma linha de tenant B, em toda tabela
- cliente autenticado não lê `supplier_expenses`, `supplier_payments` nem margem
- cliente não lê dado de outra família
- API key não alcança nada fora do escopo declarado

É o teste que sustenta a promessa de multi-tenant. Sem ele, o isolamento é só intenção.

**Fixtures de contrato para o webhook.** O payload real de produção vira arquivo de fixture, e um teste roda o perfil `wp_flat_v1` sobre ele. Quando a origem mudar o formato, o teste quebra na hora em vez de a inscrição chegar torta na fila.

**E2E cobre só os caminhos caros:**

1. Webhook → fila → alocação → `booking` `pending` → pagamento → `confirmed`
2. Portal: magic link → inscrição em 1 clique → aparece na fila
3. Fechamento financeiro de um grupo: recebimentos, gastos, margem

**Regras**

| Regra | Por quê |
|---|---|
| **Nenhuma linha de implementação antes de um teste vermelho** | Regra estruturante, não preferência de estilo |
| Todo bug vira teste que falha **antes** do fix | É o único mecanismo que impede a regressão de voltar |
| Nome do teste cita o id do requisito: `describe('IN-18: alocação em transação única')` | Rastreia PRD → teste; dá para auditar o que ainda não foi coberto |
| 100% de cobertura no núcleo de cálculo (preço, cashback, saldo); no resto, cobertura não é meta | Nesses arquivos, erro é dinheiro errado. Perseguir número global produz teste decorativo |
| Teste não depende de ordem nem de estado deixado por outro | Falha intermitente destrói a confiança na suíte, e suíte sem confiança é ignorada |
| Seeds determinísticos e factories; nada de data real (`new Date()`) dentro de teste | Teste que quebra em janeiro por causa de aniversário é o pior tipo de flaky |
| CI roda unitário + integração + RLS a cada push; vermelho bloqueia merge | Suíte que não bloqueia nada vira sugestão |

**TDD importa mais aqui do que no caso médio**, porque grande parte da implementação será gerada por assistente. O teste é a especificação executável que fixa o comportamento: escrito antes, ele define o alvo e a geração converge nele; escrito depois, ele tende a documentar o que o código faz — inclusive o que faz de errado.

Fluxo, sempre nesta ordem:

```
requisito do PRD  →  teste  →  rodar e ver falhar  →  implementar  →  verde  →  refactor
```

### 10.4 Definição de pronto

Uma feature está pronta quando:

1. Teste unitário do domínio, escrito antes, passando
2. Teste de integração cobrindo o caminho que toca o banco
3. Teste de RLS quando a feature adiciona tabela ou policy
4. Sem lógica de negócio em componente
5. Requisito do PRD citado no nome do teste
6. Sem `TODO` e sem código comentado
7. Migration aplicada e reversível
8. Se a feature expõe dado pessoal, DTO explícito revisado e teste de isolamento cobrindo a nova rota

---

## 11. Segurança e LGPD

Não sou advogado e esta seção não substitui parecer jurídico — ela traduz a LGPD em requisitos de engenharia, que é a parte que o código precisa resolver.

### 11.1 O que é dado sensível aqui (e o que não é)

Correção que muda obrigações: **CPF não é dado sensível na LGPD.** O Art. 5º, II define sensível como origem racial ou étnica, convicção religiosa, opinião política, filiação sindical ou a organização religiosa/filosófica/política, dado referente à **saúde** ou à vida sexual, e dado genético ou biométrico. CPF, endereço, telefone e placa são **dado pessoal comum** — exigem proteção, não o regime reforçado.

Dito isso, o sistema tem dois vetores que introduzem regime mais rígido:

**Campos personalizados (§3.8) podem virar dado de saúde.** "Alergia", "restrição alimentar", "tipo sanguíneo", "condição médica" — tudo isso é dado sensível. A Drakkar tirou alergia e restrição do escopo, mas outro tenant vai querer, e o campo personalizado é exatamente por onde isso entra. Consequência: o editor precisa marcar quais campos são sensíveis, e campo sensível exige consentimento específico e destacado, além de nunca aparecer em listagem ou exportação por padrão.

**Crianças e adolescentes (Art. 14).** O sistema cadastra crianças de 0 a 10 anos como participantes. Tratamento de dado de criança exige consentimento específico e destacado de **um dos pais ou responsável legal**, e deve ser feito no melhor interesse dela. O aceite do responsável na inscrição precisa cobrir isso explicitamente — não basta o "aceito os termos" genérico.

### 11.2 Papéis e responsabilidade

| Cenário | Controlador | Operador |
|---|---|---|
| Hoje, uso próprio | Drakkar | — |
| Como SaaS | cada tenant | ExpeditionPRO |

Quando virar SaaS, o ExpeditionPRO passa a ser **operador**: trata dado pessoal por conta do tenant. Isso exige contrato de operador (DPA) no onboarding, com finalidade, instruções, subprocessadores e obrigações de segurança. É contrato, não código — mas condiciona o produto, porque o tenant precisa conseguir exportar e eliminar os dados dele sem depender de você abrir o banco.

**Subprocessadores** a declarar: Supabase (banco, auth, storage), Railway (aplicação), provedor de e-mail, FCM e APNs (push).

**Hospedagem: `us-east` (América do Norte), Supabase e Railway na mesma região.** O Railway não oferece região brasileira, e separar as duas peças recriaria o problema de latência por região cruzada que já apareceu no BellarisOS. Colocalizar as duas resolve a performance; a residência dos dados passa a ser tratada como questão jurídica, não de infraestrutura.

**Isso torna a transferência internacional obrigatória de endereçar (Arts. 33 a 36).** Não é impeditivo — é papelada que precisa existir.

| Item | Situação |
|---|---|
| Decisão de adequação da ANPD para os EUA | Não existe. A ANPD ainda não reconheceu nenhum país como adequado |
| Caminho aplicável | **Cláusulas-padrão contratuais (CPC)** do Anexo II da Resolução CD/ANPD nº 19/2024, incorporadas ao contrato com cada subprocessador |
| Prazo de adequação | O período de transição da Resolução 19/2024 encerrou em **23/08/2025** — quem transfere hoje já deveria estar com as CPCs incorporadas |
| Alternativa para o dado operacional | Art. 33, V — transferência necessária à execução de contrato do qual o titular é parte. Cobre o essencial da inscrição, **não** cobre marketing |
| Marketing e comunidade | Consentimento específico e destacado, com informação prévia do caráter internacional (Art. 33, VIII) |

**O que isso exige na prática:**

- Verificar se o DPA padrão de Supabase, Railway e provedor de e-mail já incorpora as CPCs da ANPD; onde não incorporar, negociar adendo
- Declarar a transferência e o país de destino no aviso de privacidade, de forma explícita — a omissão é a falha mais fácil de constatar
- Registrar a base legal usada por finalidade
- Manter o mínimo necessário no destino (Art. 3º, parágrafo único da Resolução 19): não replicar dado que a operação não exige

**Quando virar SaaS, isso vira cláusula do contrato com o tenant**, porque quem responde perante o titular é o controlador — o tenant. Vender para uma operadora sem informá-la de que o dado sai do país transfere para ela um risco que ela não aceitou.

> Prazos e exigências desta tabela são de agosto de 2026 e mudam. Antes de ir para produção com dado real, confirme o estado atual com o encarregado ou com assessoria jurídica.

### 11.3 Bases legais por finalidade

| Finalidade | Base legal | Consequência |
|---|---|---|
| Cadastro, inscrição, execução da expedição | Execução de contrato (Art. 7º, V) | Não depende de consentimento e não pode ser revogada sem encerrar a relação |
| Nota fiscal, guarda fiscal | Obrigação legal (Art. 7º, II) | **Prevalece sobre pedido de exclusão** — ver §11.5 |
| E-mail marketing e push promocional | Consentimento (Art. 7º, I) | Granular por canal, revogável em um clique, com registro de quando e como foi dado |
| Comunidade e uso de imagem | Consentimento específico | Separado do aceite dos termos; revogável |
| Dado de criança | Consentimento do responsável (Art. 14) | Específico e destacado |
| Prevenção a fraude, log de segurança | Legítimo interesse (Art. 7º, IX) | Exige registro do teste de balanceamento (LIA) |

`communication_consents` e `media_consents` guardam canal, data, origem e revogação; `document_acceptances` (§5.13) guarda a versão exata do texto aceito, com IP e canal. Juntos sustentam o ônus da prova, que é do controlador.

### 11.4 Direitos do titular (Art. 18)

Implementados como funcionalidade no portal, não como processo manual por e-mail:

| Direito | Implementação |
|---|---|
| Confirmação e acesso | Tela "meus dados" + **exportar tudo** em JSON e PDF, incluindo inscrições, financeiro, cashback e posts |
| Correção | Edição direta nos campos livres; campos estruturais via `profile_change_requests` (PC-07) |
| Portabilidade | O mesmo export, em formato estruturado e legível por máquina |
| Eliminação | Solicitação pelo portal → fila no back-office → **anonimização**, ver §11.5 |
| Revogação de consentimento | Um clique por canal, com efeito imediato |
| Informação sobre compartilhamento | Página de subprocessadores, versionada |

Prazo: resposta imediata em formato simplificado; resposta completa em até 15 dias.

### 11.5 Eliminação, retenção e o conflito com a guarda fiscal

**Não é possível simplesmente apagar um cliente**, e tratar isso como se fosse é o erro mais comum. Nota fiscal emitida, pagamento recebido e lançamento contábil têm guarda legal e prescrição própria. Apagar a linha destrói o ledger e cria passivo fiscal.

A saída é **anonimização** — pseudonimizar o titular preservando o registro financeiro:

```
apaga:    nome, e-mail, telefone, endereço, custom_fields,
          fotos e posts da comunidade, tokens de push, conta de acesso
preserva: booking, pagamentos, nota fiscal, valores, datas
substitui: customer → "Titular anonimizado #<id>"
```

O CPF é mantido apenas onde a legislação fiscal exigir vínculo, e nunca mais é exibido na interface.

**Tabela de retenção**

| Categoria | Prazo | Origem |
|---|---|---|
| Cadastro e inscrição | enquanto durar a relação + prazo prescricional | Contrato |
| Registro fiscal e financeiro | 5 anos | Obrigação legal |
| Registro de incidente de segurança | 5 anos, mesmo quando não comunicado | Res. CD/ANPD 15/2024, Art. 10 |
| Consentimentos e revogações | enquanto durar + prazo de prova | Ônus da prova é do controlador |
| `audit_logs` | 2 anos | Investigação |
| `intake_events` (payload cru) | 90 dias, depois só o normalizado | Payload cru é a cópia mais exposta |
| Backups | conforme rotação, documentada | Eliminação precisa alcançar o backup ou a janela precisa estar escrita |

### 11.6 Incidentes

Regulamento vigente (Res. CD/ANPD nº 15/2024):

- **3 dias úteis** para comunicar à ANPD **e aos titulares**, contados do conhecimento de que o incidente afetou dados pessoais
- **20 dias úteis** para complementar a comunicação preliminar
- **Prazos em dobro** para agente de tratamento de pequeno porte
- Registro do incidente guardado por **5 anos**, inclusive dos não comunicados

Consequência para o produto: sem log estruturado e sem `audit_logs`, você não consegue responder em três dias úteis o que vazou e de quem — e a incapacidade de responder é, por si, agravante. O runbook de incidente precisa existir antes de ser necessário.

### 11.7 Nunca expor o que não precisa

| Regra | Implementação |
|---|---|
| **Nunca serializar entidade do banco direto na resposta** | DTO explícito por audiência; whitelist de campos, nunca blacklist |
| CPF mascarado por padrão | Completo só em endpoint dedicado, com registro de acesso em `audit_logs` |
| IDs opacos | UUID em toda entidade exposta; id sequencial permite enumerar clientes e inscrições |
| Erro não vaza estrutura | Sem stack trace, sem query, sem nome de tabela na resposta. `401` em vez de `403` onde `403` confirmaria existência (§3.9) |
| Log não guarda dado pessoal | CPF, e-mail, telefone e token mascarados. Payload cru de inscrição vai para `intake_events`, que tem RLS e retenção — **nunca** para o log da aplicação |
| Storage privado | Foto da comunidade em bucket privado com URL assinada de validade curta. A comunidade é fechada; bucket público a tornaria pública por link |
| **EXIF removido no upload** | Foto de celular carrega GPS. Foto de expedição com coordenada exata, incluindo de criança, publicada num feed, é exposição que ninguém pediu |
| Sem segredo em repositório | Variáveis de ambiente; `.env` fora do git; segredo vazado é rotacionado, não removido do histórico |

### 11.8 OWASP Top 10 aplicado a este sistema

| Risco | Onde ataca aqui | Defesa |
|---|---|---|
| **A01 — Broken Access Control** | Cliente lendo dado de outra família; tenant lendo dado de outro | RLS em toda tabela + Prisma extension (§2.2) + suíte de testes de RLS obrigatória (§10.3). É o risco nº 1 deste sistema |
| **A02 — Falha criptográfica** | API key, token de sessão, backup | TLS obrigatório com HSTS; API key em hash; backup criptografado |
| **A03 — Injection** | Busca por nome e CPF, filtros, editor de documentos | Prisma parametrizado; `$queryRawUnsafe` proibido por lint; UGC da comunidade renderizado como texto; HTML do editor sanitizado por allowlist na gravação e na renderização (§5.13) |
| **A04 — Insecure Design** | — | Esta seção; modelagem que já separa audiências e congela valores |
| **A05 — Misconfiguration** | Tabela nova sem RLS | Migration não passa no CI se criar tabela sem `ENABLE ROW LEVEL SECURITY`; CORS restrito; headers de segurança e CSP |
| **A06 — Componente vulnerável** | Dependências | `npm audit` no CI, atualização automatizada, build falha em vulnerabilidade alta |
| **A07 — Falha de autenticação** | Magic link, API key | Link de uso único e 15 min; rate limit por e-mail e IP; **resposta idêntica para e-mail existente e inexistente**, senão o login vira oráculo de enumeração |
| **A08 — Falha de integridade** | Build, dependência | Lockfile versionado, CI reproduzível |
| **A09 — Log e monitoramento** | Descobrir tarde | `audit_logs` em toda ação sensível; alerta de erro; sem isso não há resposta em 3 dias úteis |
| **A10 — SSRF** | Não há fetch de URL fornecida pelo usuário no v1 | Se entrar webhook de saída, allowlist de destino e bloqueio de rede interna |

**Específicos deste sistema, além do Top 10:**

- **IDOR no portal** — trocar o id na URL para ver a inscrição de outra família. Coberto por RLS, e provado por teste, não por confiança na rota.
- **Upload malicioso** — validar por magic bytes, nunca por extensão ou `Content-Type`; reprocessar a imagem no servidor (o reencode já mata payload embutido); limite de tamanho antes de ler o corpo.
- **XSS via comunidade** — legenda e comentário são conteúdo de terceiro. Renderizar como texto, escapar sempre, CSP restritiva.
- **Enumeração de tenant** — slug inválido e slug de outro dono respondem igual.

### 11.9 Requisitos

| ID | Requisito |
|---|---|
| SEC-01 | RLS habilitada em toda tabela; migration que crie tabela sem RLS falha no CI. |
| SEC-02 | Suíte de testes de isolamento por audiência — tenant, equipe, cliente, API key — rodando a cada push. |
| SEC-03 | Toda resposta de API montada por DTO explícito; proibido serializar entidade do banco. |
| SEC-04 | CPF mascarado por padrão, com acesso completo registrado em `audit_logs`. |
| SEC-05 | Log da aplicação sem dado pessoal; mascaramento na camada de log, não no ponto de chamada. |
| SEC-06 | Storage privado com URL assinada de validade curta; EXIF removido no upload. |
| SEC-07 | Export completo dos dados do titular, em JSON e PDF, disponível no portal. |
| SEC-08 | Fluxo de eliminação por anonimização, preservando o registro fiscal e financeiro. |
| SEC-09 | Consentimento granular por finalidade, com versão do texto aceito e registro de revogação. |
| SEC-10 | Marcação de campo personalizado como sensível, com tratamento reforçado. |
| SEC-11 | Aceite do responsável cobrindo explicitamente o tratamento de dado de criança. |
| SEC-12 | Rotinas de retenção automatizadas conforme §11.5, incluindo expurgo do payload cru. |
| SEC-13 | Runbook de incidente com os prazos de §11.6 e registro guardado por 5 anos. |
| SEC-14 | Rate limit em magic link, webhook e endpoints públicos; resposta idêntica para e-mail existente e inexistente. |
| SEC-15 | Auditoria de dependências no CI, com build falhando em vulnerabilidade alta. |
| SEC-16 | Supabase e Railway na mesma região (`us-east`), para evitar latência por região cruzada. |
| SEC-17 | Cláusulas-padrão contratuais da Resolução CD/ANPD 19/2024 incorporadas aos contratos de subprocessador. |
| SEC-18 | Aviso de privacidade declarando explicitamente a transferência internacional e o país de destino. |
| SEC-19 | Criptografia em repouso e em trânsito em todos os serviços, e backup criptografado. |

### 11.10 Fora de escopo no v1

Pentest formal · certificação ISO 27001 ou SOC 2 · SIEM · WAF gerenciado · bug bounty. Entram quando houver tenant pagante exigindo, não antes.

---

## Anexo A — Catálogo de veículos (seed)

Extraído do database `👨‍👩‍👦 Clientes` no Notion (campos `Marca` e `Carro`). O Notion guarda as duas listas soltas, sem vínculo entre marca e modelo; o mapeamento abaixo foi montado para o seed.

Base: as 21 marcas e 62 modelos dos campos `Marca` e `Carro`. O Notion guarda as duas listas soltas, sem vínculo entre marca e modelo — o mapeamento abaixo foi montado para o seed. Modelos marcados com **+** não estavam no Notion e foram acrescentados a partir da pesquisa sobre o 4x4 brasileiro, cobrindo linha atual e clássicos que aparecem em expedição.

| Marca | Modelos |
|---|---|
| **Agrale** + | Marruá AM100 +, Marruá AM200 + |
| **BYD** | Shark |
| **CBT** | Javali |
| **Chevrolet** | S10, Trailblazer, Blazer, Tracker, Equinox, Silverado 1500, Colorado +, D-20 +, Bonanza +, Veraneio + |
| **Engesa** + | Engesa 4 +, Engesa 6 + |
| **Fiat** | Toro, Titano |
| **Ford** | Ranger, Bronco, Bronco Sport +, Maverick, Explorer, F-150, F-250, Rural +, F-75 + |
| **Gurgel** + | X-12 +, Xavante +, Carajás + |
| **GWM** | Haval H6, Tank 300, Tank 500 +, Poer P30 + |
| **Hyundai** | Santa Fé, Tucson +, Galloper + |
| **Jeep** | **Willys**, Compass, Renegade, Commander, Grand Cherokee, Cherokee, Cherokee Sport XJ, Wrangler, Gladiator |
| **JPX** + | Montez + |
| **KIA** | Sorento, Mohave, Sportage + |
| **Lada** + | Niva + |
| **Land Rover** | **Defender 90**, Defender 110 +, Defender 130 +, Discovery, Discovery Sport +, Freelander + |
| **Mercedes-Benz** | GLB 200, Classe G +, GLE + |
| **Mitsubishi** | L200 Triton, Triton, Triton Sport +, Pajero Full, Pajero Dakar, Pajero Sport, Pajero TR4, ASX, Outlander, Eclipse Cross |
| **Nissan** | Frontier, X-Terra, Pathfinder + |
| **RAM** | 1500, 2500, 3500, Rampage, Dakota |
| **Range Rover** | Range Rover +, Range Rover Sport +, Evoque +, Velar + |
| **Renault** | Duster, Oroch +, Koleos + |
| **Ssangyong** | Actyon Sports, Korando +, Rexton + |
| **Suzuki** | Jimny, Jimny Sierra, Jimny 4Sport +, Vitara, Grand Vitara, SX4, Samurai + |
| **Toyota** | Hilux, SW4, Bandeirante, Land Cruiser +, Land Cruiser Prado +, RAV4 |
| **Troller** | T4 +, TX4 +, RF + |
| **Volkswagen** | Amarok, Tiguan, Touareg + |

**Totais:** 27 marcas, 106 modelos.

Notas de normalização aplicadas ao seed:

- **Willys → Jeep**, conforme definido. Rural e F-75 ficam em Ford, que era quem produzia essas duas no Brasil.
- **Troller** vira marca com os modelos reais da linha (T4, TX4, RF) em vez de "Troller/Troller".
- **Range Rover** e **Land Rover** seguem como marcas separadas, como já estavam no Notion. Defender e Discovery ficam em Land Rover; a linha Range Rover ganha modelos próprios.
- Grafias corrigidas: `Gran Cherokee` → **Grand Cherokee**, `Gran Vitara` → **Grand Vitara**, `F150`/`F250` → **F-150**/**F-250**, `Haval` → **Haval H6**, `Mercedes Benz` → **Mercedes-Benz**.
- `Shark` fica em **BYD** (BYD Shark), não em GWM.
- Registros antigos com as grafias originais precisam ser remapeados na migração — a fila de catalogação de §3.3 cobre o que sobrar.

---

## Anexo B — Roteiros existentes no Notion

Para o seed de `itineraries` (campo `Expedições` do mesmo database):

Soldados Sebold · Coxilha Rica · Urubici 360 · Serra Gaúcha · Pirâmides Sagradas · Quatro Elementos · Caminho Austral · Terra de Gigantes · Vale Europeu · Rota das Cascatas · Caminho das Montanhas · Ametista e Missões · Extremo Sul · Farol de Santa Marta · Personalizado

*"Dimas" e "Supresa 2025" foram saídas pontuais para grupos fechados — entram como `kind: custom` com grupo `private`, conforme §3.5.1, e não como roteiros de catálogo. "Personalizado" também é `custom`.*

*Histórico do Notion não será migrado por enquanto. O que é semeado aqui é o catálogo de roteiros e de veículos, não os registros antigos de clientes e financeiro.*

---

*v1.9.4*
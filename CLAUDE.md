# ExpeditionPRO

SaaS multi-tenant de gestão de expedições 4x4. Tenant zero: Drakkar Expedições.
**É um sistema financeiro antes de ser um CRM:** histórico é imutável, saldo é derivado.

PRD completo em `docs/prd.md`. Requisitos têm id (`IN-08`, `PC-16`, `SEC-01`) — cite o id no nome do teste.

## Stack

React · Supabase (Postgres, Auth, Storage, Realtime) · Prisma · Railway · Capacitor
Testes: Vitest · Playwright · Postgres real, nunca mock

## Glossário (use estes nomes no código)

| PT | Código | O que é |
|---|---|---|
| Roteiro | `itinerary` | Produto: Coxilha Rica, Vale Europeu |
| Evento de agenda | `scheduleEvent` | Roteiro + datas no calendário |
| Grupo | `group` | A saída; onde as inscrições vivem |
| Inscrição | `booking` | Uma família num grupo |
| Participante | `bookingParticipant` | Cada pessoa numa inscrição |
| Cliente | `customer` | Pessoa física, única por `(tenantId, cpf)` |
| Fornecedor | `supplier` | Parceiro que presta serviço na saída |
| Oportunidade | `opportunity` | Interessado **antes** de virar inscrição — o cartão do funil |
| Etapa | `stage` | Coluna do funil, configurável por tenant |
| Conversa | `conversation` | O fio com uma pessoa num canal |
| Mensagem | `message` | Cada troca dentro de uma conversa |

Nunca traduza de novo. Dois vocabulários = bug de conversa e bug de código.

**Oportunidade não é cliente:** `customer` exige CPF, e quem pergunta o preço no WhatsApp não
tem. Oportunidade nunca vira cliente sozinha — quem promove é a equipe, ao fechar (OP-08).
**Oportunidade não é dinheiro:** `expectedValueCents` é previsão e não entra em relatório
financeiro nenhum (OP-09).

## Camadas

```
domínio         regras puras · sem I/O · sem Prisma · sem React
aplicação       casos de uso · transação, repositório, evento
infraestrutura  Prisma, Supabase, Storage, e-mail, push
interface       React, rotas HTTP, webhook
```

Dependência aponta sempre para dentro. Domínio não sabe que Prisma existe.

**Teste da fronteira:** se testar uma função de domínio exigir subir Postgres, a fronteira foi violada.

Funções puras que são o coração do sistema:
`resolvePriceCategory` · `calculateBookingTotal` · `calculateCashback` · `projectBalance` · `mapWpFlatPayload`

## Regras inegociáveis

**Código**
- Um caso de uso por arquivo, nomeado pelo que faz (`allocateIntake.ts`, `registerPayment.ts`)
- Zero lógica de negócio em componente React — componente renderiza, hook chama caso de uso
- Dinheiro em centavos, tipo `Cents` (branded). Nunca `number` solto, nunca float
- Datas: `Date` só nas bordas. No domínio, data explícita sem fuso implícito
- Validação nas bordas com Zod. *Parse, don't validate* — depois da borda o tipo é verdade
- Sem herança. Composição e função
- Sem abstração especulativa — generaliza na terceira repetição, não na segunda
- Função até ~40 linhas, arquivo até ~300
- `catch` sem tratamento é proibido. Erro de negócio é tipo, não string
- Proibido: `$queryRawUnsafe`, mock de Prisma, `TODO` em código entregue

**Simples quer dizer:** chato, previsível, entendível sem contexto. A próxima pessoa é você em oito meses. Esperteza que economiza 5 linhas e custa 20 minutos de leitura é prejuízo.

**TDD — sem exceção**
1. Escreve o teste
2. **Roda e vê falhar.** Teste que passa de primeira não testa o que se pensa
3. Implementa o mínimo
4. Refatora com a suíte verde

Nenhuma linha de implementação antes de um teste vermelho. Todo bug vira teste que falha antes do fix.

**Multi-tenant**
- `tenantId` em toda tabela de negócio. Todo unique é composto
- RLS habilitada em toda tabela, policy lendo `app_metadata` (nunca `user_metadata`)
- O role do Prisma tem `BYPASSRLS` — a RLS **não** te protege ali. O filtro vem da Prisma Client Extension, que injeta `tenantId` em todo `find*`, `create`, `update*`, `delete*`
- Toda tabela nova precisa de teste de isolamento

**Segurança**
- Nunca serializar entidade do banco na resposta. DTO explícito por audiência, whitelist
- CPF mascarado por padrão
- Log sem dado pessoal — mascarar na camada de log, não no ponto de chamada
- Payload cru de inscrição vai para `intake_events`, nunca para o log da aplicação
- `401` onde `403` confirmaria existência

## Design system

Fonte da verdade: a skill **`design-system`** — tokens, tipografia, componentes, estados de tela e padrões de composição. Carregue antes de criar ou alterar qualquer UI. Não deduza valor do código existente.

**Regras invioláveis**

- **Cor é dado.** Verde = pago/confirmado, vermelho = cancelado. Nenhuma outra cor carrega significado financeiro
- **Pendente é cinza, nunca amarelo.** Não existe âmbar em lugar nenhum
- **`--o` é do tenant e fica em quarentena:** marca, ação primária, foco, nav ativa, chip de filtro e seleção — tudo *estado de interface*. Nunca em coluna, pill ou fundo de linha que represente estado *financeiro*
- **Trocar de tenant é trocar só o bloco de accent.** Se sua mudança exigir tocar em outro token, alguma regra acima foi violada
- **Duas famílias com papéis separados:** JetBrains Mono para título, rótulo, pill e todo número; Archivo para prosa, botão, campo e célula de texto. A mono carrega identidade e dado, a Archivo carrega leitura
- **Nada hard-coded em componente** — nenhum hex, tamanho de fonte ou altura de alvo de toque. Sempre pelo token
- **Sentence case sempre.** Verbo primeiro no botão
- **Toda tela implementa os cinco estados:** carregando, vazio, erro, sem permissão, filtro sem resultado

`data-mode` e `data-density` são atributos no elemento raiz. Nenhum componente conhece modo ou densidade, e nenhum tem variante de densidade própria — só os tokens mudam.

**Componente novo é sinal de padrão errado.** Se uma tela precisa de algo que não existe na skill, pare e pergunte antes de criar.

## Definição de pronto

1. Teste de domínio escrito antes, passando
2. Teste de integração no que toca o banco
3. Teste de RLS se adicionou tabela ou policy
4. Sem lógica em componente
5. Id do requisito no nome do teste
6. Sem `TODO`, sem código comentado
7. Migration aplicada e reversível
8. DTO revisado se a feature expõe dado pessoal
9. Se tem interface: nada hard-coded, os cinco estados existem, testado nos dois modos e nas duas densidades
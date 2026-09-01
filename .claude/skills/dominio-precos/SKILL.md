---
name: dominio-precos
description: Regras de preço, faixa etária, snapshot e cashback do ExpeditionPRO. Use SEMPRE que o trabalho tocar valor de inscrição, categoria de participante, idade, tabela de preços do roteiro, cashback, saldo, recebimento ou pagamento a fornecedor — inclusive ao exibir valores em tela ou ao escrever teste sobre eles. Nunca deduza essas regras do código existente; consulte aqui.
---

# Preço, faixa etária e cashback

Núcleo financeiro do sistema. Erro aqui é dinheiro errado, então **100% de cobertura de teste** nestes arquivos.

Tudo aqui é **função pura**: entrada e saída, sem I/O, sem data corrente escondida. Se testar exigir Postgres, a fronteira foi violada.

## Dinheiro

- `BIGINT` em centavos, tipo `Cents` (branded type). Nunca `number` solto, nunca float, nunca `decimal` em JS
- Moeda única: BRL. Não existe coluna de moeda nem conversão
- **Saldo nunca é coluna.** `valorPago`, `aReceber`, saldo de fornecedor e de cashback são `SUM()` sobre a tabela de lançamentos, expostos por view. Coluna de saldo mantida à mão diverge do ledger — é questão de quando, não de se

## As cinco categorias não são do mesmo tipo

| Categoria | Chave | Natureza |
|---|---|---|
| Dupla/casal | `COUPLE` | Base da inscrição — **valor total para duas pessoas** |
| Solo | `SOLO` | Base da inscrição — **valor total para uma pessoa** |
| Adulto adicional | `EXTRA_ADULT` | Por pessoa, a partir do 3º adulto |
| Criança faixa maior | `CHILD_MID` | Por criança |
| Criança faixa menor | `CHILD_YOUNG` | Por criança |

`COUPLE` e `SOLO` são mutuamente exclusivas e precificam a **base**. Preço não é soma por cabeça.

```ts
adultos = participantes com idade > child_mid_max_age
base    = adultos >= 2 ? precoCouple : precoSolo   // cobre 1 ou 2 adultos
extras  = max(0, adultos - 2) * precoExtraAdult
        + criancasMid   * precoChildMid
        + criancasYoung * precoChildYoung
total   = base + extras
```

## Faixa etária

Configurada **por roteiro** (`itineraries.child_young_max_age`, `child_mid_max_age`), herdando o padrão da empresa. Defaults: menor até 5, maior 6–10, adulto 11+.

**A idade é sempre calculada na data de início do grupo.** Nunca na data da inscrição, nunca em `new Date()`. A data entra como parâmetro da função.

## Snapshot — a regra que não se negocia

Cada `bookingParticipant` grava no ato: categoria resolvida, valor unitário em centavos, origem (`auto` ou `override` com motivo).

Três coisas reescrevem o passado sem isso:
1. A criança de 10 anos faz 11 antes da viagem
2. O roteiro é reajustado depois da inscrição
3. Alguém recebeu cortesia

Preços do roteiro são versionados por `valid_from`. Reajuste nunca altera inscrição existente.

**Congelamento acontece na alocação ao grupo**, não na chegada da inscrição — sem grupo não há data de início, e sem data não há faixa etária nem preço.

## Grupo com preço manual

`groups.pricing_mode = 'manual'` libera valor livre por inscrição e **não aplica as categorias**. Existe para grupo fechado negociado como pacote. O valor continua congelado na inscrição; só a origem do número muda.

## Confirmação vem do dinheiro

Inscrição nasce `pending` em qualquer origem. Lançar o **primeiro** recebimento — integral ou parcial — muda para `confirmed` na mesma transação, gravando `confirmedBy` e `confirmedAt`. Restrito a `owner` e `admin`.

- Confirmação manual sem pagamento existe como exceção, com motivo obrigatório em `confirmedNote`
- Excluir o único pagamento **não** reverte o status automaticamente — alerta e exige decisão
- Cancelar inscrição não apaga o recebimento; o valor fica no ledger

## Vagas

`capacity_vehicles` é nullable — `NULL` significa sem limite. **Só inscrição confirmada ocupa vaga.** Pendente aparece na lista e não segura lugar: quem paga primeiro leva.

Totais do grupo sempre separados entre **confirmado** e **projetado** (confirmado + pendente). Somar pendente na receita infla previsão de caixa.

## Cashback

Módulo nasce **desligado**, com todos os valores zerados.

- Regra por percentual **ou** valor fixo, nas configurações da empresa
- `groups.cashback_override` tem três estados: `inherit` (default), `off`, `custom`. Booleano não serve — "herdar" e "ligado" são coisas diferentes
- Crédito vai para o **responsável** da inscrição, nunca rateado entre a família
- Base configurável: valor pago ou valor contratado
- Liberação após o término da saída. Saída cancelada não gera crédito
- Resgate é lançamento negativo na inscrição, **nunca** altera o valor congelado do participante
- Teto de resgate por inscrição, para não zerar uma venda
- **A regra vigente é congelada na inscrição** (`cashback_rule_snapshot`). Cashback é passivo; recalcular crédito antigo gera saldo que não bate com o que o cliente viu

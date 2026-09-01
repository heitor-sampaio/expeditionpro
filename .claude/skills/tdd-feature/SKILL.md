---
name: tdd-feature
description: Ciclo TDD obrigatório do ExpeditionPRO — escrever o teste, rodar e ver falhar, implementar o mínimo, refatorar. Use SEMPRE que for implementar qualquer requisito, feature, caso de uso, correção de bug ou função de domínio neste projeto, mesmo que o pedido não mencione teste. Se você está prestes a escrever código de produção, esta skill se aplica.
---

# TDD no ExpeditionPRO

Regra do projeto: **nenhuma linha de implementação antes de um teste vermelho.** Não é preferência de estilo — é estrutural, e vale inclusive para correção de uma linha.

## Por que a ordem importa aqui

Boa parte da implementação é gerada por assistente. Teste escrito **antes** é especificação executável: define o alvo e a geração converge nele. Escrito depois, ele documenta o que o código faz — inclusive o que faz de errado.

## Ciclo

### 1. Ancorar no requisito

Localize o id no `docs/prd.md` (`IN-08`, `PC-16`, `GR-05`, `SEC-01`). Ele vai no nome do teste:

```ts
describe('IN-08: primeiro pagamento confirma a inscricao', () => {
  it('muda pending para confirmed ao lancar o primeiro recebimento', ...)
})
```

Isso dá rastreio do PRD até a suíte e mostra o que ainda não foi coberto.

Se não existe requisito correspondente, pare e pergunte. Feature sem requisito no PRD é escopo não decidido.

### 2. Escolher a camada

| O que está sendo feito | Teste | Ferramenta |
|---|---|---|
| Regra pura: preço, faixa etária, cashback, saldo, parser, validação de CPF/placa | Unitário, sem banco | Vitest |
| Repositório, transação, constraint, trigger | Integração, **Postgres real** | Vitest + Supabase local |
| Tabela ou policy nova | Isolamento por audiência | Vitest, uma sessão por papel |
| Fluxo que dá prejuízo se quebrar | E2E | Playwright |

**Nunca mocke o banco.** Metade das regras deste sistema vive em constraint e trigger — `UNIQUE (group_id, responsible_customer_id)`, hierarquia de dois níveis da família, RLS inteira. Teste que mocka Prisma passa verde sem tocar em nada disso.

### 3. Escrever o teste

Comportamento esperado, não implementação. O teste não deve saber como a função faz.

- Sem `new Date()` dentro do teste. Data real quebra em janeiro por causa de aniversário — o pior tipo de flaky. Injete a data
- Sem dependência de ordem ou de estado deixado por outro teste
- Seeds determinísticos e factories

### 4. Rodar e ver falhar

**Este passo não é opcional.** Teste que passa de primeira não está testando o que se pensa: ou o comportamento já existia, ou a asserção está errada. Ver o vermelho é a verificação de que o teste tem valor.

Confirme também que a mensagem de falha é a esperada, não um erro de import.

### 5. Implementar o mínimo

Só o suficiente para ficar verde. Nada além — o que sobra é abstração especulativa, que o `CLAUDE.md` proíbe.

### 6. Refatorar

Com a suíte verde, aplique as regras de código do `CLAUDE.md`: função até ~40 linhas, sem lógica em componente, `Cents` para dinheiro, sem herança.

## Cobertura

- **100% no núcleo de cálculo** — preço, cashback, saldo. Lá, erro é dinheiro errado
- **No resto, cobertura não é meta.** Perseguir número global produz teste decorativo

## Bug

Todo bug vira teste que falha **antes** do fix, reproduzindo o caso real. É o único mecanismo que impede a regressão de voltar. Nome do teste cita o requisito violado.

## Reforço determinístico (opcional, recomendado)

Instrução pode ser racionalizada num momento de pressa; hook não. Em `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "npx vitest related --run $CLAUDE_FILE_PATHS || true" }
        ]
      }
    ]
  }
}
```

Roda os testes relacionados a cada edição. Confirme o formato na documentação do Claude Code e ajuste o matcher ao seu setup antes de usar.

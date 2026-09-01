---
name: perfil-intake
description: Como o ExpeditionPRO recebe inscrições por webhook — autenticação por API key, perfis de mapeamento por origem, validação, fila de alocação e fixtures de contrato. Use SEMPRE que o trabalho envolver webhook, intake, payload de formulário, parser de inscrição, fila de alocação ou criação de booking a partir de origem externa.
---

# Entrada de inscrições

O receptor **não** adivinha o formato da origem. Ele grava o corpo cru e aplica um perfil de mapeamento escolhido pelo `source`.

```
payload cru → intake_events → perfil de mapeamento → forma interna
```

Perfil é função de tradução, não schema de banco. Origem nova ganha perfil novo; o domínio não muda.

## Endpoint

```
POST /v1/intake/{tenant_slug}
api_token: epk_live_<tenant>_<32 bytes>
```

API key com escopo `intake:write`, conferida **antes de qualquer gravação**. Inválida, revogada, expirada, sem escopo ou de outro tenant → `401`.

`401` também quando o slug não bate com o dono da chave. Nunca `403`: confirmaria que o slug existe e permitiria enumerar tenants.

## Perfil `wp_flat_v1`

Aceita array de um elemento (lê `[0].body`) ou objeto direto. `webhookUrl`, `executionMode`, `headers`, `params`, `query` são ignorados.

Campos planos em `fields`, cada um como `{ label, value, formatted }`.

**Leia sempre `value`, nunca `formatted`.** `formatted` é apresentação e é ambíguo — em `estado` traz `"Santa Catarina"` quando o sistema quer `"SC"`.

Acompanhantes: `acomp_{n}_nome`, `acomp_{n}_cpf`, `acomp_{n}_nascimento`, com `n` a partir de 1. **Varra as chaves que casam com `acomp_\d+_*`** em vez de confiar em `qtd_acompanhantes`. Divergência entre o contador e os campos presentes vale o que veio, e vira aviso na fila.

## Validação — obrigatório bloqueia, opcional não

| Campo | Ausente ou vazio |
|---|---|
| `resp_nome`, `resp_cpf`, `resp_nascimento`, `resp_telefone`, `resp_email` | `422` com o campo culpado |
| `acomp_{n}_nome`, `acomp_{n}_cpf`, `acomp_{n}_nascimento`, quando o bloco existe | `422` |
| Qualquer outro campo do núcleo | Aceita, grava vazio, segue |
| Campo desconhecido | Aceita, vai para `custom_fields`, gera aviso |

Campo opcional nunca gera `422`, nunca marca `error`, nunca impede alocação. Valor malformado em campo opcional grava como veio e registra aviso.

**Três níveis de validação:**

- **Verificável** — CPF (dígito verificador), data, placa (antigo e Mercosul)
- **Só formato** — e-mail, telefone, CEP. Checagem deliberadamente **frouxa**: `@` mais domínio plausível; 10 ou 11 dígitos após o DDI. Regex agressiva de e-mail rejeita endereço válido
- **Nenhuma** — nome, endereço, observações

A verificação real vem do uso: `email_verified_at` no consumo do magic link, `phone_verified_at` no contato efetivo.

## Deduplicação

- `external_id` é **opcional**. Quando enviado, precisa ser único por tenant e origem — id sequencial de formulário reinicia por formulário, então componha (`"{form_id}:{entry_id}"`)
- A chave real é `(group_ref, responsible.cpf)`, garantida por `UNIQUE (group_id, responsible_customer_id)` em `bookings`

## Fila de alocação

**A inscrição do webhook não vira `booking` na chegada.** O formulário é por roteiro, não por saída — adivinhar a data coloca a família no grupo errado, com preço congelado da data errada.

```
received → needs_allocation → allocated
                ↓
         discarded | error
```

Ao alocar, **uma transação**: cria ou reaproveita o cliente por CPF, cria os acompanhantes vinculados, cria o `booking` em `pending`, resolve a categoria de cada participante pela data de início daquele grupo e congela os preços.

- A fila **sugere** o próximo grupo aberto do roteiro; sugestão nunca é aplicada sem clique
- `form_mappings` associa `form_id` a roteiro — não case roteiro por `form_title`, que quebra ao renomear o formulário
- Divergência com cliente existente vira item de revisão, **nunca sobrescreve**
- Recusa é sempre manual. O sistema nunca recusa nem expira sozinho

## Fixtures de contrato

Payload real de produção vira arquivo de fixture, e um teste roda o perfil sobre ele. Quando a origem mudar o formato, o teste quebra na hora em vez de a inscrição chegar torta na fila.

Guarde ao menos: sem acompanhante, com 2 acompanhantes, com campo desconhecido, com CPF inválido, com opcional malformado.

## Nunca

- Payload cru no log da aplicação. Ele vai para `intake_events`, que tem RLS e retenção de 90 dias
- Escrita direta no domínio sem passar pela staging. Dado de formulário é sujo e auto-merge silencioso corrompe a base

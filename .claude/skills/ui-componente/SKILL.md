---
name: ui-componente
description: Design system do ExpeditionPRO — tokens, componentes e regras de cor para qualquer interface. Use SEMPRE que for criar ou alterar tela, componente, layout, estilo, CSS ou classe Tailwind neste projeto, mesmo que o pedido não mencione design. Se o resultado aparece na tela para alguém, esta skill se aplica.
---

# Interface no ExpeditionPRO

Fonte da verdade: `design/README.md` e os tokens em `design/`, exportados do Claude Design.

**Leia antes de escrever qualquer estilo.** Não deduza token do código existente — código pode estar desatualizado, o export não.

**Se precisar de um componente que não existe no README, pare e pergunte antes de criar.** Componente inventado no meio de uma tarefa não volta para o Claude Design, e é assim que o design system e o código começam a divergir.

## As três regras de cor

**1. Cor é dado.** Verde é pago ou confirmado. Vermelho é cancelado. Nenhuma outra cor carrega significado financeiro.

**2. Pendente é cinza, nunca âmbar.** O que ainda não aconteceu não tem cor. Se você está prestes a usar amarelo ou laranja para "aguardando", pare — essa é a decisão que faz o laranja da marca funcionar, e é a que se desfaz sozinha primeiro.

**3. O laranja fica em quarentena.** Só marca, ação primária, foco e item de navegação ativo. Nunca em status, nunca em fundo de linha, nunca em valor. Trocar de tenant precisa ser trocar só as variáveis de accent — se sua mudança exigir tocar em outra coisa, você violou alguma regra acima.

## Nunca

- Hex, rgb ou hsl literal em componente. Só `var(--token)`
- Valor de espaçamento, raio ou tamanho de fonte fora da escala
- Cor semântica reaproveitada para navegação, marca ou destaque visual
- Modo escuro tratado como inversão do claro. As cores semânticas têm valores próprios, porque o verde claro não tem contraste sobre fundo escuro
- Sombra para criar hierarquia. Hierarquia vem de hairline e espaço
- Lógica de negócio dentro do componente — ele renderiza, o hook chama o caso de uso

## Os cinco estados de tela

Toda tela implementa os cinco, não só o caminho feliz:

| Estado | O que mostrar |
|---|---|
| Carregando | Esqueleto com a forma do conteúdo real, não spinner centralizado |
| Vazio | Convite com a ação ao lado — "Nenhuma inscrição na fila" + botão, nunca lamento |
| Erro | O que aconteceu e o que fazer, em uma frase, com ação de repetir |
| Sem permissão | O que o papel atual não alcança e a quem pedir. Nunca uma tela em branco |
| Filtro sem resultado | Diferente de vazio: diz que o filtro não achou nada e oferece limpar |

Vazio e filtro-sem-resultado são estados distintos. Tratar os dois igual faz o usuário achar que perdeu dado quando só errou o filtro.

## Sempre

- `font-variant-numeric: tabular-nums` em todo número comparável na vertical. Coluna de dinheiro precisa alinhar vírgula com vírgula
- As duas densidades funcionando: compacta é o padrão do back-office, confortável é portal e mobile
- Foco de teclado visível
- Responsivo até 380px
- Alvo de toque de 44px na densidade confortável

## Escrita da interface

Sentence case, nunca Title Case. Verbo primeiro no botão: "Alocar no grupo", não "Confirmar". O nome da ação não muda no caminho — botão "Alocar" produz aviso "Alocado". Erro diz o que aconteceu e o que fazer, em uma frase, sem pedir desculpa. Tela vazia é convite com a ação ao lado.

## Antes de entregar

1. Nenhum literal de cor no diff
2. Testado nos dois modos e nas duas densidades
3. Números conferidos alinhando em coluna
4. Zero lógica de negócio no componente
5. Os cinco estados de tela existem

## Quando o design mudar

O design system vive no Claude Design. Traga a mudança de lá com `/design-sync` ou pelo export, e atualize `design/tokens.css`. **Nunca ajuste um token direto no código** — a divergência entre canvas e repositório começa exatamente aí, e só aparece semanas depois.

Se o README de `design/` mudar de nome ou de lugar, atualize também o `CLAUDE.md`. Caminho quebrado no contexto é pior que caminho ausente: o Claude tenta ler, falha em silêncio e segue inventando.
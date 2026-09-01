---
name: design-system
description: Design system do ExpeditionPRO — tokens, tipografia, espaçamento, componentes, estados de tela e padrões de composição. Use SEMPRE que for criar ou alterar tela, componente, layout, estilo, CSS ou classe Tailwind neste projeto, mesmo que o pedido não mencione design. Se o resultado aparece na tela para alguém, esta skill se aplica.
---

# Design system do ExpeditionPRO

Fonte da verdade do design system. Consulte este arquivo antes de criar ou alterar qualquer UI.
Todos os valores abaixo são finais. Nenhum hex, tamanho de fonte ou altura de alvo de toque pode ser escrito direto no componente — sempre pelo token.

**Se uma tela nova precisar de um componente que não existe aqui, pare e pergunte antes de criar.** Componente inventado no meio de uma tarefa não volta para o design system, e é aí que a spec e o código começam a divergir.

---

## 1. Regras invioláveis

1. **Cor é dado.** Verde = pago/confirmado. Vermelho = cancelado. Nenhuma outra cor carrega significado financeiro.
2. **Pendente é cinza, não amarelo.** O que ainda não aconteceu não tem cor. **Não existe âmbar em lugar nenhum do sistema.**
3. **O laranja é do tenant e fica em quarentena.** Só marca, ação primária, foco e item de navegação ativo. Nunca status, nunca fundo de linha. Trocar de tenant é trocar só as variáveis de accent.

**Cor de interface × cor de dado:** chip de filtro ativo, nav ativa, foco e seleção usam `--o` porque são estado de *interface*. Nada disso pode aparecer em coluna, pill ou fundo de linha que represente estado *financeiro*. Verde, vermelho e cinza são reservados ao dado.

Modo escuro é primeira classe, não inversão: as cores semânticas têm valores próprios (`#00875a` não tem contraste suficiente sobre fundo escuro). O relevo **escurece** em vez de clarear.

---

## 2. Tokens

Copie como está. Overrides por atributo no elemento raiz: `data-mode`, `data-density`.

```css
:root {
  /* accent do tenant — o único bloco que muda por tenant */
  --o: #fc4c02;
  --o-h: #e04302;
  --o-soft: #fff0e9;

  /* tinta */
  --ink: #242428;
  --ink-2: #55555f;
  --ink-3: #8a8a96;

  /* superfícies */
  --bg: #f5f5f7;
  --card: #ffffff;
  --card-2: #fafafb;
  --line: #e4e4ea;
  --line-2: #d3d3dc;
  --relief: #e2e2ea;

  /* semântica financeira */
  --go: #00875a;
  --go-soft: #e4f4ee;
  --no: #c4341e;
  --no-soft: #fbeae7;

  /* densidade — compacta é o padrão */
  --row: 52px;
  --pad-y: 12px;
  --ctl: 40px;
  --tap: 36px;

  /* famílias */
  --f-sans: Archivo, Helvetica, Arial, sans-serif;
  --f-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* raios */
  --r-nav: 8px;
  --r-card: 10px;
  --r-card-lg: 14px;
  --r-pill: 999px;
}

[data-mode="dark"] {
  --o-soft: #2e1509;

  --ink: #f2f2f5;
  --ink-2: #b0b0bd;
  --ink-3: #7c7c8a;

  --bg: #0e0e11;
  --card: #18181c;
  --card-2: #1e1e23;
  --line: #2a2a31;
  --line-2: #3a3a44;
  --relief: #23232b;

  --go: #3fc294;
  --go-soft: #0f2b22;
  --no: #e8705c;
  --no-soft: #2e1512;
}

[data-density="comfy"] {
  --row: 64px;
  --pad-y: 16px;
  --ctl: 44px;
  --tap: 44px;
}
```

`--o` e `--o-h` **não mudam entre modos** — são do tenant, não do tema.

### Uso de cada token

| Token | Onde |
|---|---|
| `--o` | marca, botão primário, foco, nav ativa, chip de filtro ativo, barra de "a receber" |
| `--o-h` | hover do botão primário |
| `--o-soft` | fundo da nav ativa, fundo do chip ativo, anel de foco de campo, fundo do item selecionado |
| `--ink` | texto principal, títulos, números |
| `--ink-2` | texto secundário, item de nav inativo, percentual de barra |
| `--ink-3` | rótulo em caixa alta, contexto, unidade do número, placeholder |
| `--bg` | fundo da página |
| `--card` | cartões, sidebar, campos, botão secundário |
| `--card-2` | cabeçalho e rodapé de tabela, hover de linha, dia fora do mês, campo somente leitura |
| `--line` | bordas de cartão, divisores de linha e de bloco de estatística |
| `--line-2` | borda de campo, de botão secundário, de overlay |
| `--relief` | trilho de barra, avatar neutro, pill de pendente, esqueleto de carregamento, faixa informativa |
| `--go` / `--go-soft` | pago, confirmado, emitido |
| `--no` / `--no-soft` | cancelado, estornado, erro de campo |

### Raios

| Uso | Valor |
|---|---|
| Item de navegação | 8px |
| Cartão pequeno | 10px |
| Cartão grande, modal, menu, textarea | 14px |
| Botão, campo, pill, chip, avatar, barra | 999px |

### Densidade

Duas modalidades por atributo no root. **Compacta é o padrão.** Só os tokens mudam — nenhum componente tem variante de densidade própria.

| Token | Compacta | Confortável |
|---|---|---|
| `--row` (altura de linha) | 52px | 64px |
| `--pad-y` (padding vertical) | 12px | 16px |
| `--ctl` (botão, campo) | 40px | 44px |
| `--tap` (linha clicável) | 36px | 44px |

---

## 3. Tipografia

Duas famílias, com papéis separados. Sem serifa.

> **A mono carrega identidade e dado. A Archivo carrega leitura.**

```css
--f-sans: Archivo, Helvetica, Arial, sans-serif;              /* 400 500 600 700 */
--f-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;  /* 500 600 700 */
```

| Papel | Família | Tamanho / peso / tracking | Cor |
|---|---|---|---|
| Título de página | **Mono** 700 | 26px / -0.03em | `--ink` |
| Título de cartão, de modal | **Mono** 700 | 15px / -0.02em | `--ink` |
| Número de estatística | **Mono** 700 | 25px / -0.035em | `--ink` (ou semântica quando o número **é** o dado) |
| Unidade do número ("R$", "%") | **Mono** 600 | 15px | `--ink-3` |
| Rótulo em caixa alta | **Mono** 600 | 11px / 0.06em / uppercase | `--ink-3` |
| Pill de status | **Mono** 700 | 11px / 0.04em / uppercase | semântica |
| Valor, data, CPF, placa, percentual, contagem | **Mono** 500–700 | 14px | conforme o dado |
| Corpo | Archivo 400 | 14px | `--ink` |
| Corpo em tabela, campo, botão | Archivo 500–600 | 14px | `--ink` |
| Nome em linha de tabela | Archivo 600 | 14px | `--ink` |
| Rótulo de campo | Archivo 600 | 13px | `--ink` |
| Contexto secundário, ajuda, erro | Archivo 500 | 12px | `--ink-3` (erro: `--no`) |

**A divisão é semântica, não decorativa.** Título, rótulo, pill e todo número são mono — é o que dá o registro de instrumento e o que garante alinhamento de coluna. Prosa, célula de texto, botão e campo são Archivo, porque mono em texto corrido cansa e ocupa cerca de 15% a mais de largura, o que numa tabela de sete colunas custa uma coluna inteira.

**A mono é menor de propósito.** Largura fixa e altura-x alta pesam mais no mesmo corpo: título de página 30→26, número de estatística 27→25, tracking do rótulo 0.09→0.06em e da pill 0.06→0.04em. Mono já vem espaçada de fábrica.

A unidade fica **colada** ao número:

```css
display: flex; align-items: baseline; gap: 3px;
```

**Todo número usa `font-variant-numeric: tabular-nums`** — redundante na JetBrains Mono, mas garante o alinhamento se o fallback do sistema entrar em cena. Coluna de dinheiro alinha vírgula com vírgula: `text-align: right`.

---

## 4. Fundo topográfico

Um mapa de relevo, não linhas soltas: **curvas de nível fechadas e aninhadas**, cobrindo o fundo inteiro, com a cada terceira curva em traço mais forte — a convenção de curva-mestra dos mapas reais. É o que diferencia a leitura de "mapa" da leitura de "listrado".

Camada fixa sob todo o conteúdo. **Nunca sob o dado:** cartões e sidebar são opacos e a textura desaparece atrás deles; ela só aparece nas margens e nas respirações do layout. Todo o conteúdo fica em `z-index: 1`.

As curvas são geradas, não desenhadas à mão — path data fixo de mapa fica enorme no repositório e impossível de ajustar. O gerador é **determinístico**: sem aleatoriedade, o mesmo desenho em toda renderização.

```tsx
const CENTERS = [
  { cx: 260, cy: 250, rings: 9, gap: 46, sx: 1.30, sy: 0.78, seed: 0.0 },
  { cx: 880, cy: 640, rings: 8, gap: 52, sx: 1.15, sy: 0.86, seed: 1.7 },
  { cx: 640, cy: 120, rings: 6, gap: 58, sx: 1.45, sy: 0.70, seed: 3.1 },
];

function contour(cx: number, cy: number, r: number, seed: number, k: number) {
  const N = 44;
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const w =
      1 +
      0.17 * Math.sin(3 * a + seed) +
      0.11 * Math.sin(5 * a - seed * 1.3) +
      0.06 * Math.sin(7 * a + k * 0.55);
    pts.push([cx + Math.cos(a) * r * w, cy + Math.sin(a) * r * w]);
  }
  // Catmull-Rom fechada → cúbica
  const p = (i: number) => pts[(i + N) % N];
  let d = `M${p(0)[0].toFixed(1)},${p(0)[1].toFixed(1)}`;
  for (let i = 0; i < N; i++) {
    const [x0, y0] = p(i - 1), [x1, y1] = p(i), [x2, y2] = p(i + 1), [x3, y3] = p(i + 2);
    d += `C${(x1 + (x2 - x0) / 6).toFixed(1)},${(y1 + (y2 - y0) / 6).toFixed(1)}` +
         ` ${(x2 - (x3 - x1) / 6).toFixed(1)},${(y2 - (y3 - y1) / 6).toFixed(1)}` +
         ` ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  return d + "Z";
}

export function TopoBackground() {
  return (
    <div aria-hidden className="topo">
      <svg viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice">
        {CENTERS.flatMap(({ cx, cy, rings, gap, sx, sy, seed }) =>
          Array.from({ length: rings }, (_, k) => (
            <path
              key={`${cx}-${k}`}
              d={contour(cx, cy, (k + 1) * gap, seed, k)}
              transform={`translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`}
              className={k % 3 === 2 ? "topo-index" : undefined}
            />
          ))
        )}
      </svg>
    </div>
  );
}
```

```css
.topo {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  overflow: hidden; opacity: 0.7;
}
.topo svg { width: 118%; height: 118%; margin: -9% 0 0 -9%; display: block; }
.topo path {
  fill: none;
  stroke: var(--relief);
  stroke-width: 0.75;
  vector-effect: non-scaling-stroke;
}
.topo path.topo-index { stroke-width: 1.4; }
```

| Decisão | Motivo |
|---|---|
| Curvas **fechadas e aninhadas**, não linhas horizontais | Curva fechada lê como elevação; linha aberta lê como listra |
| Três centros com escala e semente diferentes | Um centro só vira alvo concêntrico; três criam vales onde os conjuntos se aproximam |
| Cada terceira curva mais grossa | Curva-mestra é a convenção que faz o olho reconhecer mapa topográfico |
| Perturbação por três harmônicas | Anel perfeito parece gráfico; a irregularidade é o que parece terreno |
| SVG a 118% com margem negativa | Nenhuma curva termina visível na borda — o mapa continua para fora da tela |
| `vector-effect: non-scaling-stroke` | Mantém 0,75px real em qualquer tela. Sem isso o `slice` engrossa o traço e vira listrado |
| Gerador determinístico | Sem `Math.random`: mesmo desenho em toda renderização, e diff estável |

O traço usa `--relief`, então **escurece no modo escuro** em vez de clarear — relevo claro sobre fundo preto vira risco de giz.

Nenhuma imagem no sistema: avatares são iniciais, o fundo é SVG gerado.

---

## 5. Componentes

### Sidebar — 224px

```css
flex: 0 0 224px;
background: var(--card);
border-right: 1px solid var(--line);
padding: 18px 12px 16px;
gap: 4px;
```

- **Marca**: quadrado de 30px, raio 10px, fundo `--o`, iniciais do tenant em branco 13px/700. Ao lado: nome do tenant 13px/700/-0.02em e "ExpeditionPRO" em rótulo caixa alta de 10px.
- **Item**: `padding: 9px 12px`, raio 8px, 14px/500, cor `--ink-2`, largura total, texto à esquerda. Hover: `background: var(--card-2)`.
- **Item ativo**: `background: var(--o-soft)`, `color: var(--o)`, peso 600.
- **Contador**: badge `min-width: 22px; height: 19px; padding: 0 6px`, raio 999px, fundo `--o`, texto branco 11px/700 tabular.
- **Cabeçalho de seção**: rótulo em caixa alta, `padding: 16px 8px 6px`.
- **Rodapé de usuário**: avatar neutro de 30px + nome 13px/600 + papel 11px `--ink-3`, separado por `border-top: 1px solid var(--line)`.

### Faixa de estatísticas

Um único cartão grande, **divisores verticais de 1px entre os blocos, sem cartão individual por bloco**.

```css
/* faixa */
background: var(--card); border: 1px solid var(--line);
border-radius: var(--r-card-lg); padding: 18px 4px;
display: flex; flex-wrap: wrap;

/* bloco */
flex: 1 1 150px; padding: 0 22px;
border-left: 1px solid var(--line);
display: flex; flex-direction: column; gap: 5px;
```

Três linhas por bloco, nesta ordem:
1. Número de estatística com a unidade colada
2. Rótulo em caixa alta
3. Linha de contexto 12px/500 `--ink-3` ("3 famílias", "sobre confirmado")

Máximo de uma faixa por tela.

### Barra de meta segmentada

Uma **única barra de 8px** arredondada, dividida em três segmentos por largura percentual.

```css
display: flex; height: 8px; border-radius: var(--r-pill);
overflow: hidden; background: var(--relief);
```

| Segmento | Cor | Significado |
|---|---|---|
| 1 | `--go` | recebido |
| 2 | `--o` | a receber de quem já está inscrito |
| trilho | `--relief` | vagas ainda abertas |

Legenda embaixo: quadradinho 9×9 raio 3px na cor do segmento + rótulo e percentual em 12px/500 `--ink-2`, `gap: 7px`, itens com `gap: 20px`.

### Barra inline de linha

Versão de **6px** dentro da linha da tabela, com o percentual à direita em **12px/700** `--ink-2`, `min-width: 34px`, alinhado à direita.

| Situação | Preenchimento |
|---|---|
| 100% | `--go` |
| parcial | `--o` |
| zero | só o trilho `--relief` |
| cancelada | largura 0 e percentual "—", com a opacidade da linha cancelada |

### Linha de tabela

```css
display: grid; align-items: center; gap: 12px;
padding: var(--pad-y) 20px;
min-height: var(--row);
border-bottom: 1px solid var(--line);
/* hover */ background: var(--card-2);
```

- **Avatar circular de 34px** com iniciais em 12px/700.

| Estado | Fundo do avatar | Texto |
|---|---|---|
| confirmado | `--go-soft` | `--go` |
| pendente | `--o-soft` | `--o` |
| cancelado | `--relief` | `--ink-3` |

- Nome em 14px/600. Segunda linha em 12px/500 `--ink-3` com o contexto: veículo e placa no caso de cliente, cidade e serviço no caso de fornecedor.
- **Cabeçalho**: rótulos em caixa alta sobre `--card-2`, `padding: 10px 20px`, mesma grade.
- **Rodapé de totais**: obrigatório em toda tabela de dinheiro. Mesma grade, fundo `--card-2`, `padding: 14px 20px`, valores 14px/700 tabulares; o valor em aberto em `--o`.
- Toda tabela vive em wrapper `overflow-x: auto` com `min-width` na grade interna.

**Linha cancelada:** `opacity: 0.45` em todo o conteúdo **exceto a coluna do nome**, que permanece 100% legível.

### Pill de status

```css
height: 24px; padding: 0 10px; border-radius: var(--r-pill);
display: inline-flex; align-items: center;
font-size: 11px; font-weight: 700;
letter-spacing: 0.06em; text-transform: uppercase;
```

| Estado | Fundo | Texto |
|---|---|---|
| Confirmada / Pago / Emitida | `--go-soft` | `--go` |
| Pendente / A vencer / Não emitida | `--relief` | `--ink-2` |
| Cancelada / Estornada | `--no-soft` | `--no` |
| Aviso neutro (fila, validação) | `--card-2` + `1px solid var(--line-2)` | `--ink-2` |

Aviso de validação **nunca** é vermelho — vermelho é cancelado.

### Botões — pílula de `var(--ctl)`

```css
height: var(--ctl); padding: 0 18px;
border-radius: var(--r-pill);
font-size: 14px; font-weight: 600; cursor: pointer;
```

| Variante | Fundo | Borda | Texto | Hover |
|---|---|---|---|---|
| Primário | `--o` | nenhuma | `#fff` | fundo `--o-h` |
| Secundário | `--card` | `1px solid var(--line-2)` | `--ink` | borda `--ink-3` |
| Desabilitado | `--card` | `1px solid var(--line-2)` | `--ink-3` | — (`cursor: not-allowed`) |
| Destrutivo | igual ao primário | — | — | a cor não muda; o **verbo** carrega a intenção |

- **Foco**: `outline: 2px solid var(--o); outline-offset: 2px` — global via `:focus-visible`, sempre visível.
- Variante de 32px para ação em cabeçalho de cartão, faixa de seleção e paginação.
- Ícone circular (navegação de mês): `var(--ctl)` × `var(--ctl)`.
- **No máximo uma ação primária por tela.**

### Campos — pílula de `var(--ctl)`

```css
height: var(--ctl); padding: 0 16px;
border-radius: var(--r-pill);
border: 1px solid var(--line-2);
background: var(--card); color: var(--ink);
font-size: 14px; font-weight: 500;

/* foco */
border-color: var(--o);
box-shadow: 0 0 0 3px var(--o-soft);
```

- **Rótulo** 13px/600 acima, `gap: 6px`. **Ajuda** 12px/500 `--ink-3` abaixo. **Erro** mesma métrica em `--no`, e a borda do campo vira `--no`.
- **Campo com unidade**: a unidade em 13px/600 `--ink-3` dentro da pílula, à esquerda; o `input` sem borda, valor tabular alinhado à direita.
- **Textarea**: raio 14px (não pílula), `padding: 12px 16px`, `resize: vertical`.
- **Somente leitura**: fundo `--card-2`, borda `--line`, texto `--ink-3`.
- **`select`**: mesma pílula, `padding: 0 14px`, `cursor: pointer`.
- Formulário longo: duas colunas com `flex: 1 1 140px` e `gap: 12px`, dentro de cartão de raio 10px.

### Seleção

- **Checkbox / radio**: 20px, `accent-color: var(--o)`, dentro de linha clicável de `min-height: var(--tap)` com `gap: 12px` e rótulo 14px/500. Em tabela: 18px, primeira coluna de 36px.
- **Switch**: trilho 44×26 raio 999px, `padding: 3px`, botão de 20px. Ligado: trilho `--o`, botão branco. Desligado: trilho `--relief`, botão `--card`. Linha de `min-height: var(--tap)`.
- **Item selecionado** (lista, cartão de membro): `border-color: var(--o)` e `background: var(--o-soft)`.

---

## 6. Base e overlays

### Feedback inline

```css
border-radius: var(--r-card); padding: 12px 14px;
display: flex; align-items: center; gap: 12px;
/* bolinha de 8px + texto 13px/600 */
```

| Tipo | Fundo | Bolinha e texto |
|---|---|---|
| Sucesso financeiro | `--go-soft` | `--go` |
| Cancelamento, estorno | `--no-soft` | `--no` |
| Informativo, alerta operacional | `--relief` | `--ink-3` / texto `--ink-2` |

Aviso informativo é **sempre cinza**. Verde e vermelho só quando o aviso **é** o dado financeiro.

### Toast

```css
background: var(--card);
border: 1px solid var(--line-2);
border-radius: var(--r-card-lg);
box-shadow: 0 8px 24px rgba(0,0,0,0.12);
padding: 14px 16px;
```

Bolinha de estado + título 14px/600 + detalhe 12px `--ink-3` + botão "Desfazer" de 30px à direita.
**O nome da ação não muda no caminho:** o botão "Alocar" produz o aviso "Alocado".

### Esqueleto de carregamento

Blocos `--relief` de raio 999px **na forma do conteúdo real**: avatar de 34px + duas barras (11px e 9px de altura, larguras variando entre 28% e 52%), dentro de linha de `min-height: var(--row)`.
**Nunca spinner centralizado numa página inteira.**

### Modal

```css
max-width: 380px; padding: 22px;
background: var(--card); border: 1px solid var(--line);
border-radius: var(--r-card-lg);
box-shadow: 0 18px 44px rgba(0,0,0,0.18);
/* fundo do overlay */ background: rgba(0,0,0,0.35);
```

Título 16px/700, corpo 14px/500 `--ink-2`, ações à direita com `gap: 10px`: secundário mantém, primário executa. O foco entra no overlay e volta ao gatilho ao fechar.

### Menu suspenso

```css
background: var(--card);
border: 1px solid var(--line-2);
border-radius: var(--r-card-lg);
box-shadow: 0 12px 32px rgba(0,0,0,0.14);
padding: 6px;
```

Item: raio 8px, `padding: 10px 12px`, 14px/500; hover `--card-2`. Separador `1px` `--line` com `margin: 6px 4px`. Item destrutivo em `--no`.

### Tooltip

Fundo `--ink`, texto `--bg`, raio 8px, `padding: 7px 11px`, 12px/600.

### Navegação e tabela avançada

- **Trilha**: 13px/500 `--ink-3` com barras "/"; item atual em `--ink` peso 600.
- **Barra de filtros**: busca em pílula `flex: 1 1 220px` + chips ativos (32px, `--o-soft`/`--o`, com "×") + "Limpar filtros" secundário de 32px.
- **Coluna ordenável**: o rótulo em caixa alta ganha cor `--ink` e seta "↓" quando é a ordenação vigente.
- **Seleção múltipla**: checkbox de 18px na primeira coluna (36px). Com seleção ativa, aparece uma faixa `--o-soft` acima da tabela: contagem em `--o` 13px/600 + ações em massa (primário sólido de 32px + secundário com borda `--o`).
- **Paginação**: rodapé `--card-2`, "1–5 de 132" em 12px `--ink-3` à esquerda, botões de 32px à direita, página atual em `--o` sólido.
- **Linha expandida**: o detalhe abre em `--card-2` dentro da mesma grade, sem modal.

---

## 7. Padrões de composição

Se uma tela nova precisa de um componente novo, o padrão está errado antes do componente. **Pare e pergunte.**

### Anatomia da página

| Camada | Regra |
|---|---|
| Casca | Sidebar de 224px fixa + barra superior com trilha, densidade e modo. Conteúdo com máximo de 1320px, `padding: 26px 28px 56px`, gaps de 20–22px. |
| Cabeçalho | Título de página, pill de estado ao lado do título, metadados em linha separada por bolinhas de 4px em `--line-2`. Ações à direita, no máximo uma primária. |
| Resumo | Faixa de estatísticas quando há números que resumem o todo. Nunca mais de uma por tela. |
| Corpo | **Tabela** quando as linhas se comparam coluna a coluna. **Lista de cartões** quando cada item exige decisão própria. **Grade de calendário** quando o eixo é o tempo. |
| Rodapé | Toda tabela de dinheiro fecha com totais na mesma grade. |

### Estados obrigatórios de toda tela

| Estado | Regra |
|---|---|
| Carregando | Esqueleto na forma do conteúdo, na altura real da linha. Nunca spinner de página inteira. |
| Vazio | Convite com a ação ao lado: título 16px/700, uma linha de instrução 13px `--ink-3`, botão primário na mesma linha. Sem ilustração, sem lamento. |
| Erro | O que aconteceu e o que fazer, em uma frase, com a ação de tentar de novo. Vermelho só no texto, nunca no fundo da área. |
| Sem permissão | Explica quem libera. O botão continua visível, desabilitado — esconder a ação esconde o sistema. |
| Filtro sem resultado | Diferente de vazio: oferece limpar o filtro, não criar registro. |

### Layout de lista × tabela

- **Tabela**: linhas homogêneas que se comparam entre si (participantes, recebimentos, pagamentos, índices de cadastro).
- **Lista de cartões**: cada item carrega contexto próprio e uma decisão individual, com seletor e ação na própria linha (fila de alocação).
- **Grade de calendário**: células de `min-height: 118px`, dias fora do mês em `--card-2`; evento em cartão raio 8px, fundo `--card-2`, `border-left: 3px solid` — `--go` quando lotado, `--o` quando há vaga.

### Multi-tenant

Trocar de tenant é trocar `--o` e `--o-h`, e derivar `--o-soft`. Nenhum outro token é do tenant; nenhum componente conhece o nome do tenant além da marca da sidebar. Verde, vermelho e cinza são iguais em todos os tenants — são dado, não marca.

### Permissão e portal

O portal do cliente usa o mesmo sistema em **densidade confortável** e nunca mostra custo de fornecedor, margem ou observação interna de equipe.

### Módulos e o padrão de cada um

| Módulo | Padrão de tela |
|---|---|
| Saídas e grupos | Cabeçalho + faixa de estatísticas + barra de meta + duas tabelas com rodapé de totais |
| Fila de alocação | Lista de cartões agrupada por roteiro, avisos em pill neutra, faixa de alerta acima de 24 h |
| Clientes e famílias | Cabeçalho de entidade + abas + tabela; membros vinculados em cartão pequeno |
| Fornecedores | Índice em tabela + cabeçalho de entidade + abas (Saídas, Pagamentos, Dados fiscais) |
| Roteiros | Índice em tabela + formulário em duas colunas dentro de cartão |
| Veículos e catálogo | Índice em tabela com busca e chips de filtro |
| Agenda | Grade de calendário com cartão de evento; pendentes indicadas à parte |
| Recebimentos | Barra de filtros + tabela com seleção múltipla e ação em massa |
| Pagamentos | Mesmo padrão de recebimentos, coluna "a pagar" em vez de "a receber" |
| Cashback | Cartão de saldo + extrato de movimentação |
| Relatórios | Faixa de estatísticas + tabela; gráfico só quando a tendência é o dado |
| Portal do cliente | Mesmo sistema em densidade confortável |
| Configuração do tenant | Abas laterais + formulários em cartão; o accent é o único token editável |

---

## 8. Escrita da interface

- **Sentence case sempre**, nunca Title Case.
- **Verbo primeiro no botão**: "Alocar no grupo", não "Confirmar".
- O nome da ação não muda no caminho: botão "Alocar" produz aviso "Alocado".
- Mensagem de erro diz **o que aconteceu e o que fazer**, em uma frase, sem pedir desculpa: "O CPF 042.318.769-04 já existe com outro nome. Confira antes de salvar."
- Tela vazia é **convite com a ação ao lado**, não lamento.
- Rótulo em caixa alta é sempre substantivo curto: "Confirmado", "A receber", "Situação".

---

## 9. Piso de qualidade

- Responsivo até **380px**: cabeçalhos e grupos de ação com `flex-wrap`, tabelas em wrapper `overflow-x: auto` + `min-width`.
- **Foco de teclado sempre visível**: `:focus-visible { outline: 2px solid var(--o); outline-offset: 2px }`.
- `@media (prefers-reduced-motion: reduce)` zera transições e animações.
- **Alvo de toque de 44px na densidade confortável**: `--ctl` em botões e campos, `--tap` em linhas clicáveis. Nenhuma altura de alvo fixa em px.
- **Contraste AA nos dois modos.** Um bloco que sobrescreve `data-mode` precisa declarar também `color: var(--ink)`, senão herda a tinta do modo de fora.
- Nenhuma dependência de asset. Externas: **Archivo** (400/500/600/700) e **JetBrains Mono** (500/600/700), ambas do Google Fonts.
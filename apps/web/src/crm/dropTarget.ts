export type StageKind = 'open' | 'won' | 'lost';

export interface ColumnBounds {
  readonly stageId: string;
  readonly kind: StageKind;
  /** Coordenadas de viewport, como saem de `getBoundingClientRect`. */
  readonly left: number;
  readonly right: number;
}

export interface DropTarget {
  readonly stageId: string;
  /** OP-08: soltar numa coluna de ganho é recusado — fechar cria a inscrição. */
  readonly allowed: boolean;
}

/**
 * OP-05 — qual coluna recebe o cartão, dada a posição horizontal do ponteiro.
 *
 * Só o eixo X importa: as colunas são faixas verticais, e obrigar acerto vertical faria o
 * cartão precisar ser solto dentro da lista — que pode estar vazia, e aí não haveria onde
 * soltar.
 *
 * **No vão entre colunas vale a mais próxima.** O espaçamento é de 16px e ninguém acerta
 * isso com o dedo: exigir precisão faria o arrastar falhar sem dizer por quê, que é a pior
 * forma de uma interface recusar alguma coisa. Fora do quadro inteiro, aí sim, não há alvo.
 *
 * Devolve a coluna de ganho com `allowed: false` em vez de `null` de propósito: a tela
 * mostra por que não pode. Alvo que simplesmente não reage deixa a pessoa achando que o
 * arrastar quebrou.
 */
export function dropTarget(x: number, columns: readonly ColumnBounds[]): DropTarget | null {
  if (columns.length === 0) return null;

  const dentro = columns.find((c) => x >= c.left && x <= c.right);
  if (dentro) return { stageId: dentro.stageId, allowed: dentro.kind !== 'won' };

  const primeira = columns[0]!;
  const ultima = columns[columns.length - 1]!;
  if (x < primeira.left || x > ultima.right) return null;

  // No vão: a de borda mais próxima do ponteiro.
  const maisPerto = columns.reduce((melhor, atual) =>
    distancia(x, atual) < distancia(x, melhor) ? atual : melhor,
  );
  return { stageId: maisPerto.stageId, allowed: maisPerto.kind !== 'won' };
}

function distancia(x: number, coluna: ColumnBounds): number {
  if (x < coluna.left) return coluna.left - x;
  if (x > coluna.right) return x - coluna.right;
  return 0;
}

/**
 * AU-27 — a variável entra no texto onde o cursor está.
 *
 * Ela entrava sempre no fim. Numa coluna de duzentos pixels ninguém notava; num painel em que
 * se escreve a mensagem inteira do cliente, clicar `contato.nome` no meio de uma frase e ver o
 * nome grudado no fim dela é a diferença entre a ferramenta servir e não servir.
 *
 * Puro, e num arquivo só, porque é a única decisão do gesto — o componente que o usa não tem
 * teste, e o que não tem teste precisa não ter decisão dentro.
 */

export interface TextoComCursor {
  readonly texto: string;
  /** Onde deixar o cursor depois: logo após o marcador, para continuar escrevendo. */
  readonly cursor: number;
}

export function inserirMarcador(
  texto: string,
  inicio: number | null,
  fim: number | null,
  caminho: string,
): TextoComCursor {
  const marcador = `{{${caminho}}}`;
  // Sem posição conhecida, o fim é o destino honesto: é onde a pessoa estava escrevendo. E
  // posição além do texto vira o fim também — cursor velho não pode apagar o que foi digitado.
  const de = limitar(inicio ?? texto.length, texto.length);
  const ate = limitar(fim ?? de, texto.length);
  const [antes, depois] = [Math.min(de, ate), Math.max(de, ate)];

  return {
    texto: `${texto.slice(0, antes)}${marcador}${texto.slice(depois)}`,
    cursor: antes + marcador.length,
  };
}

function limitar(valor: number, teto: number): number {
  return Math.max(0, Math.min(valor, teto));
}

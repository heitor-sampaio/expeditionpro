import {
  applyPercentFloor,
  cents,
  InvalidCentsError,
  sumCents,
  type Cents,
} from '../money/cents.js';

/**
 * GR-04 — o desconto de balcão: a equipe negocia sobre o **total** da inscrição, mas o
 * que o sistema guarda é o unitário congelado de cada participante (§3.4). Estas funções
 * fazem a ponte entre as duas linguagens.
 *
 * Diferente do cupom (CP-05), que entra como resgate e deixa o snapshot intacto, o
 * desconto de balcão **é** reprecificação: o motivo fica gravado em cada linha tocada e
 * a origem do preço vira `override`. São coisas distintas de propósito — o cupom é uma
 * campanha que o cliente resgata, isto é a casa refazendo o preço daquela família.
 */

/**
 * Rateia um desconto do total entre os participantes, proporcionalmente ao que cada um
 * vale.
 *
 * A obrigação inegociável é a soma: os novos unitários somam **exatamente** o total
 * combinado. Rateio proporcional puro quase nunca dá inteiro em centavos, então cada
 * parte é arredondada para baixo e os centavos restantes são distribuídos pelo método da
 * maior fração — quem mais perdeu no arredondamento recebe primeiro, e empate se resolve
 * pela ordem. Sem isso, uma inscrição de R$ 3.580,00 com 33% viraria R$ 2.398,59 quando
 * o combinado era R$ 2.398,60, e o centavo de diferença deixaria a inscrição eternamente
 * a um passo de fechar.
 */
export function distributeDiscount(
  unitCents: readonly Cents[],
  discountCents: Cents,
): readonly Cents[] {
  if (discountCents < 0) {
    throw new InvalidCentsError(
      `Desconto deve ser não-negativo; recebido: ${String(discountCents)}`,
    );
  }

  const subtotal = sumCents(unitCents);
  if (discountCents > subtotal) {
    throw new InvalidCentsError(
      `Desconto de ${String(discountCents)} passa do total de ${String(subtotal)}`,
    );
  }

  const target = subtotal - discountCents;
  // Total zerado (cortesia integral, ou inscrição que já valia zero): ninguém recebe nada
  // e não há resto a distribuir. Sem este atalho, a proporção dividiria por zero.
  if (subtotal === 0 || target === 0) {
    return unitCents.map(() => cents(0));
  }

  const exact = unitCents.map((unit) => (Number(unit) * target) / subtotal);
  const shares = exact.map((value) => Math.floor(value));

  let rest = target - shares.reduce((acc, value) => acc + value, 0);
  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of byFraction) {
    if (rest === 0) break;
    shares[index] = shares[index]! + 1;
    rest -= 1;
  }

  return shares.map((value) => cents(value));
}

/**
 * O desconto que um percentual representa sobre o total.
 *
 * Arredonda para baixo pelo mesmo motivo do cupom (CP-04): o centavo que sobra seria
 * desconto **maior** que o combinado, e desconto é dinheiro que não entra.
 */
export function discountFromPercent(subtotalCents: Cents, percent: number): Cents {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new InvalidCentsError(
      `Percentual deve estar entre 0 e 100; recebido: ${String(percent)}`,
    );
  }
  return applyPercentFloor(subtotalCents, percent);
}

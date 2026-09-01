/**
 * Dinheiro em centavos, tipo branded.
 *
 * O PRD (§3.6) é inegociável: BIGINT em centavos, nunca float, nunca decimal em JS.
 * A marca (`brand`) existe só em tempo de compilação — impede passar um `number`
 * solto onde o sistema espera dinheiro, sem custo em runtime. Todo valor monetário
 * entra por `cents()`, o único portão. Depois dele, o tipo é verdade.
 */

declare const centsBrand: unique symbol;
export type Cents = number & { readonly [centsBrand]: 'Cents' };

export class InvalidCentsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCentsError';
  }
}

/** Único construtor de `Cents`. Rejeita o que não é inteiro seguro. */
export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new InvalidCentsError(
      `Valor monetário deve ser inteiro seguro em centavos; recebido: ${String(value)}`,
    );
  }
  return value as Cents;
}

export const zeroCents: Cents = cents(0);

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function subCents(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

export function sumCents(values: readonly Cents[]): Cents {
  return cents(values.reduce<number>((acc, v) => acc + v, 0));
}

/**
 * Percentual de um valor, arredondado ao centavo (meio para cima).
 * Base do cálculo de cashback por percentual (§5.8 / CB-01).
 */
export function applyPercent(base: Cents, percent: number): Cents {
  if (!Number.isFinite(percent) || percent < 0) {
    throw new InvalidCentsError(
      `Percentual deve ser finito e não-negativo; recebido: ${String(percent)}`,
    );
  }
  return cents(Math.round((base * percent) / 100));
}

/**
 * Percentual de um valor, truncado ao centavo (sempre para baixo).
 * Base do desconto por percentual (§5.15 / CP-01): centavo que sobra é desconto maior
 * que o combinado, e a diferença aparece no caixa; centavo que falta fica com a casa.
 */
export function applyPercentFloor(base: Cents, percent: number): Cents {
  if (!Number.isFinite(percent) || percent < 0) {
    throw new InvalidCentsError(
      `Percentual deve ser finito e não-negativo; recebido: ${String(percent)}`,
    );
  }
  return cents(Math.floor((base * percent) / 100));
}

/** Formata para exibição: "R$ 12.345,67". Determinístico, sem dependência de locale. */
export function formatBRL(value: Cents): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const reais = Math.floor(abs / 100);
  const centavos = (abs % 100).toString().padStart(2, '0');
  const grouped = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}R$ ${grouped},${centavos}`;
}

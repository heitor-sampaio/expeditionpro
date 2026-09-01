import { cents, sumCents, zeroCents, type Cents } from '../money/cents.js';
import { compareLocalDate, fullYearsBetween, type LocalDate } from '../date/localDate.js';

/**
 * Núcleo de precificação (§3.4). Funções puras: idade e total sem I/O, sem data
 * corrente escondida. A idade entra pela data de início do grupo, sempre.
 *
 * As cinco categorias não são do mesmo tipo: COUPLE/SOLO precificam a BASE (não por
 * cabeça); EXTRA_ADULT/CHILD_MID/CHILD_YOUNG somam por pessoa.
 */

/** Classificação etária de um participante — o que dá para resolver isolado. */
export type AgeBand = 'adult' | 'child_mid' | 'child_young';

/**
 * As cinco categorias do snapshot (§3.4). A base depende da composição do grupo.
 * `MANUAL` (AG-08) é a exceção: grupo de preço manual não aplica categoria — o valor é
 * livre por inscrição e o núcleo de preço nunca produz `MANUAL`, só o caminho manual.
 */
export type PriceCategory =
  'COUPLE' | 'SOLO' | 'EXTRA_ADULT' | 'CHILD_MID' | 'CHILD_YOUNG' | 'MANUAL';

export interface AgeBands {
  readonly childYoungMaxAge: number;
  readonly childMidMaxAge: number;
}

export interface PriceTable {
  readonly coupleCents: Cents;
  readonly soloCents: Cents;
  readonly extraAdultCents: Cents;
  readonly childMidCents: Cents;
  readonly childYoungCents: Cents;
}

/** Faixa etária na data de início do grupo (§3.4). */
export function resolvePriceCategory(
  birthDate: LocalDate,
  groupStartDate: LocalDate,
  bands: AgeBands,
): AgeBand {
  const age = fullYearsBetween(birthDate, groupStartDate);
  if (age <= bands.childYoungMaxAge) return 'child_young';
  if (age <= bands.childMidMaxAge) return 'child_mid';
  return 'adult';
}

/** Total da inscrição pelo algoritmo casal/solo + adicionais (§3.4). */
export function calculateBookingTotal(bands: readonly AgeBand[], prices: PriceTable): Cents {
  const adults = count(bands, 'adult');
  const childrenMid = count(bands, 'child_mid');
  const childrenYoung = count(bands, 'child_young');

  const base = adults >= 2 ? prices.coupleCents : adults === 1 ? prices.soloCents : zeroCents;
  const extraAdults = Math.max(0, adults - 2);

  return sumCents([
    base,
    multiply(prices.extraAdultCents, extraAdults),
    multiply(prices.childMidCents, childrenMid),
    multiply(prices.childYoungCents, childrenYoung),
  ]);
}

export interface ParticipantPrice {
  readonly category: PriceCategory;
  readonly unitCents: Cents;
}

/**
 * Snapshot por participante (§3.4): a categoria resolvida e o valor unitário a
 * congelar. A base casal fica numa linha (o par em zero) para a soma dos unitários
 * bater exatamente com `calculateBookingTotal` — o invariante do snapshot.
 */
export function priceParticipants(
  bands: readonly AgeBand[],
  prices: PriceTable,
): ParticipantPrice[] {
  const totalAdults = count(bands, 'adult');
  let adultIndex = 0;

  return bands.map((band) => {
    if (band === 'child_young')
      return { category: 'CHILD_YOUNG', unitCents: prices.childYoungCents };
    if (band === 'child_mid') return { category: 'CHILD_MID', unitCents: prices.childMidCents };

    const index = adultIndex;
    adultIndex += 1;
    if (totalAdults === 1) return { category: 'SOLO', unitCents: prices.soloCents };
    if (index === 0) return { category: 'COUPLE', unitCents: prices.coupleCents };
    if (index === 1) return { category: 'COUPLE', unitCents: zeroCents };
    return { category: 'EXTRA_ADULT', unitCents: prices.extraAdultCents };
  });
}

/** Participante a precificar: uma identidade opaca (o domínio não a interpreta) + data de nascimento. */
export interface BookingParticipantInput {
  readonly ref: string;
  readonly birthDate: LocalDate;
}

export interface BookingParticipantSnapshot {
  readonly ref: string;
  readonly ageBand: AgeBand;
  readonly category: PriceCategory;
  readonly unitCents: Cents;
}

export interface BookingPricing {
  readonly total: Cents;
  readonly participants: readonly BookingParticipantSnapshot[];
}

/**
 * Precifica a inscrição inteira (§3.4): resolve a faixa de cada participante na data
 * de início do grupo, atribui categoria e congela o unitário, preservando ordem e ref.
 * É a operação de snapshot — a soma dos unitários é sempre `total` (invariante herdado
 * de `priceParticipants`). A ordem dos adultos decide quem é COUPLE e quem é adicional.
 */
export function priceBooking(
  participants: readonly BookingParticipantInput[],
  groupStartDate: LocalDate,
  bands: AgeBands,
  prices: PriceTable,
): BookingPricing {
  const ageBands = participants.map((p) =>
    resolvePriceCategory(p.birthDate, groupStartDate, bands),
  );
  const lines = priceParticipants(ageBands, prices);
  const snapshots = participants.map((participant, index) => ({
    ref: participant.ref,
    ageBand: ageBands[index]!,
    category: lines[index]!.category,
    unitCents: lines[index]!.unitCents,
  }));
  return { total: calculateBookingTotal(ageBands, prices), participants: snapshots };
}

export interface PriceVersion {
  readonly validFrom: LocalDate;
  readonly prices: PriceTable;
}

/**
 * Escolhe a tabela de preços vigente na data (§3.4): a versão mais recente cujo
 * valid_from é <= a data. Sem versão vigente, null — reajuste futuro não retroage.
 */
export function resolveApplicablePrice(
  versions: readonly PriceVersion[],
  date: LocalDate,
): PriceTable | null {
  let best: PriceVersion | null = null;
  for (const version of versions) {
    if (compareLocalDate(version.validFrom, date) <= 0) {
      if (best === null || compareLocalDate(version.validFrom, best.validFrom) > 0) {
        best = version;
      }
    }
  }
  return best === null ? null : best.prices;
}

function count(bands: readonly AgeBand[], band: AgeBand): number {
  return bands.filter((current) => current === band).length;
}

function multiply(price: Cents, quantity: number): Cents {
  return cents(price * quantity);
}

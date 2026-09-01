import { formatPlate, isValidPlate, parsePlate } from '../vehicle/plate.js';

/**
 * Lista do comboio (GR-17) — quem dirige o quê, na ordem em que os carros saem.
 *
 * A unidade é o **carro**: uma linha por inscrição, com o condutor e o veículo. É a
 * terceira leitura do mesmo grupo, cada uma com sua unidade — quarto na roomlist (GR-15),
 * pessoa no seguro (GR-16), carro aqui.
 */

/** Um carro a colocar na lista. Veículo ausente é `null`, não string vazia. */
export interface ConvoyEntry {
  readonly driver: string;
  readonly brand: string | null;
  readonly model: string | null;
  readonly plate: string | null;
}

export interface ConvoyRow {
  readonly position: number;
  readonly driver: string;
  readonly brand: string;
  readonly model: string;
  readonly plate: string;
}

export interface ConvoyInput {
  /** O carro do condutor da empresa (CF-04), que abre o comboio. */
  readonly lead: ConvoyEntry | null;
  /** Os carros dos inscritos, na ordem em que devem aparecer. */
  readonly entries: readonly ConvoyEntry[];
}

const ABSENT = '—';

export function buildConvoyList(input: ConvoyInput): readonly ConvoyRow[] {
  const all = input.lead === null ? input.entries : [input.lead, ...input.entries];

  return all.map((entry, index) => ({
    position: index + 1,
    driver: entry.driver,
    brand: entry.brand ?? ABSENT,
    model: entry.model ?? ABSENT,
    plate: formatOrKeep(entry.plate),
  }));
}

/**
 * Pontuada como se lê no carro: `ABC-1234` no formato antigo, `ABC1D23` no Mercosul.
 * Placa que a validação de hoje não reconhece sai como está — o documento mostra o que
 * está cadastrado, e não é o lugar de descobrir cadastro velho.
 */
function formatOrKeep(plate: string | null): string {
  if (plate === null) return ABSENT;
  return isValidPlate(plate) ? formatPlate(parsePlate(plate)) : plate;
}

/**
 * Formatação de apresentação do portal — data civil (ISO "YYYY-MM-DD") e dinheiro em
 * centavos. Só a borda de UI: nenhuma regra de negócio, nenhum cálculo com fuso.
 */

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "12 ago" a partir de "2026-08-12". */
export function formatDay(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

/** "12 ago" ou "12 – 15 ago" (mesmo dia → um só). */
export function formatDateRange(startIso: string, endIso: string): string {
  return startIso === endIso
    ? formatDay(startIso)
    : `${formatDay(startIso)} – ${formatDay(endIso)}`;
}

/** Centavos → "1.234,56" (sem o símbolo; a unidade "R$" vem colada no layout). */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const MONTHS_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/**
 * Data da saída por extenso, para o cliente conferir antes de confirmar a inscrição:
 * "28 a 30 de agosto de 2026". Repete só o que muda — mesmo mês não aparece duas vezes,
 * mesmo ano tampouco.
 */
export function formatDateRangeLong(startIso: string, endIso: string): string {
  const [sy, sm, sd] = parts(startIso);
  const [ey, em, ed] = parts(endIso);

  if (startIso === endIso) return `${sd} de ${MONTHS_LONG[sm - 1]} de ${sy}`;
  if (sy !== ey) {
    return `${sd} de ${MONTHS_LONG[sm - 1]} de ${sy} a ${ed} de ${MONTHS_LONG[em - 1]} de ${ey}`;
  }
  if (sm !== em)
    return `${sd} de ${MONTHS_LONG[sm - 1]} a ${ed} de ${MONTHS_LONG[em - 1]} de ${ey}`;
  return `${sd} a ${ed} de ${MONTHS_LONG[sm - 1]} de ${sy}`;
}

function parts(iso: string): [number, number, number] {
  return [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))];
}

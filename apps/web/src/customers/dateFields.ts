/**
 * Borda de UI: o DTO do back-office exibe data civil em BR (`dd/mm/aaaa`) e o
 * `<input type="date">` fala ISO (`aaaa-mm-dd`). Só recorta a string — nada de `Date`,
 * que traria fuso para uma data que não tem hora (§3.4).
 */
export function brDateToIso(value: string): string {
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

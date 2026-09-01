/**
 * Normalização de nome de pessoa (CL-01). Guardado com a primeira letra de cada palavra
 * em maiúscula; partículas comuns de nomes brasileiros (de, da, dos…) ficam minúsculas,
 * exceto quando abrem o nome. Trata hífen e apóstrofo (Ana-Maria, D'Ávila).
 *
 * Puro e sem fuso/locale escondido — só transforma a string.
 */

const PARTICLES = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'di',
  'du',
  'del',
  'la',
  'van',
  'von',
]);

export function normalizePersonName(raw: string): string {
  const words = raw.trim().replace(/\s+/g, ' ').toLowerCase().split(' ').filter(Boolean);
  return words
    .map((word, index) => (index > 0 && PARTICLES.has(word) ? word : capitalizeToken(word)))
    .join(' ');
}

/** Capitaliza cada segmento separado por hífen ou apóstrofo (mantém o separador). */
function capitalizeToken(word: string): string {
  return word
    .split('-')
    .map((part) => part.split("'").map(capitalizeFirst).join("'"))
    .join('-');
}

function capitalizeFirst(segment: string): string {
  return segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : segment;
}

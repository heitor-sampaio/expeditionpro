/**
 * RO-02 — o slug do roteiro: o endereço por onde o link público de inscrição (IN-25) chama
 * um roteiro. Minúscula, sem acento, só letra, número e hífen.
 *
 * **É um endereço, não um rótulo.** Nasce do nome na criação, mas a partir daí só muda quando
 * alguém o edita de propósito: renomear "Coxilha Rica" para "Coxilha Rica • O caminho dos
 * tropeiros" não pode derrubar todo anúncio já pago que aponta para o slug antigo.
 *
 * Devolve `null` quando não sobra nada — nome feito só de emoji ou pontuação existe, e um
 * roteiro com slug vazio seria uma URL que ninguém consegue escrever. Quem chama decide o que
 * fazer com a recusa; aqui não se lança, porque texto torto é dado de entrada, não exceção.
 *
 * A normalização é a mesma de `searchKey` na primeira metade e diverge na segunda: lá o espaço
 * sobrevive porque o texto volta a ser lido por gente; aqui ele vira hífen porque o texto vai
 * para dentro de uma URL.
 */
export function itinerarySlug(bruto: string): string | null {
  const slug = bruto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  return slug === '' ? null : slug;
}

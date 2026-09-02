/**
 * AT-06 — as duas grafias do mesmo celular brasileiro.
 *
 * O Brasil acrescentou um nono dígito aos celulares, e o WhatsApp nem sempre o usa: a mesma
 * pessoa é `55 48 98888-8888` na ficha e `55 48 8888-8888` no que a Evolution manda.
 * Comparando texto, nenhuma conversa casa com nenhuma ficha — e o sintoma é **silêncio**:
 * ninguém vê erro, todo contato parece novo, e a equipe atende cliente antigo como
 * desconhecido.
 *
 * Esta função **não escolhe** uma grafia e não reescreve o que está guardado. O número que a
 * instância usa é o que disca; trocá-lo por uma forma "certa" poderia impedir a mensagem de
 * sair. Ela devolve as duas para quem precisa procurar pelas duas.
 */

/** Celular: no Brasil o assinante começa com 6 a 9. Fixo começa com 2 a 5 e não tem nono. */
const CELULAR = /^[6-9]/;

export function phoneVariants(phone: string): string[] {
  const digitos = phone.replace(/\D/g, '');
  if (digitos === '') return [];

  const outra = outraGrafia(digitos);
  return outra === null ? [digitos] : [digitos, outra];
}

function outraGrafia(digitos: string): string | null {
  // Com DDI: 55 + DDD (2) + assinante. Sem DDI: DDD (2) + assinante — muita ficha antiga é
  // assim, e o cadastro aceita as duas formas.
  const comDdi = digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13);
  const semDdi = digitos.length === 10 || digitos.length === 11;
  if (!comDdi && !semDdi) return null;

  const prefixo = comDdi ? digitos.slice(0, 4) : digitos.slice(0, 2);
  const assinante = comDdi ? digitos.slice(4) : digitos.slice(2);

  if (assinante.length === 8) {
    // Oito dígitos: ou é celular antigo, e ganha o nono, ou é fixo e fica como está.
    return CELULAR.test(assinante) ? `${prefixo}9${assinante}` : null;
  }
  // Nove dígitos começando em 9: é o nono acrescentado, e a grafia antiga é sem ele.
  return assinante.startsWith('9') ? `${prefixo}${assinante.slice(1)}` : null;
}

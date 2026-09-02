import { searchKey } from '@expedition/domain';

/**
 * AT-07 — achar um contato na caixa, por nome ou por telefone.
 *
 * São as duas formas que a equipe tem na cabeça: o nome, quando lembra de quem é, e o número,
 * quando está com ele na frente — o cliente ligou, ou veio numa ficha.
 *
 * A normalização do nome é a **mesma** da busca de clientes (`searchKey`, CL-02): quem digita
 * "jose" acha "José". Duas normalizações diferentes no mesmo sistema significam a mesma busca
 * achando numa tela e não achando na outra.
 *
 * Filtra o que já está carregado, e não pergunta ao servidor. A caixa cabe inteira na tela
 * hoje; buscar no banco só faz sentido junto de paginação, e paginação sem lista grande é
 * complexidade adiantada. Quando a lista crescer, isto vira uma consulta — e o teste continua
 * dizendo o que ela precisa achar.
 */
export function matchesSearch(
  conversa: { displayName: string | null; phone: string | null },
  termo: string,
): boolean {
  const chave = searchKey(termo);
  if (chave === '') return true;

  const porNome = conversa.displayName !== null && searchKey(conversa.displayName).includes(chave);

  // Só dígitos dos dois lados: quem procura digita o que vê — "(48) 99999-8877" — e o que
  // está guardado é `5548999998877`. `includes` porque o pedaço decorado é o fim do número.
  const digitos = termo.replace(/\D/g, '');
  const porTelefone = digitos !== '' && conversa.phone !== null && conversa.phone.includes(digitos);

  return porNome || porTelefone;
}

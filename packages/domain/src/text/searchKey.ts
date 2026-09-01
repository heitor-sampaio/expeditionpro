/**
 * CL-02 — chave de busca: o texto reduzido à forma em que duas grafias do mesmo nome se
 * encontram. Minúscula, sem acento, sem espaço sobrando.
 *
 * Existe porque `contains` com `mode: 'insensitive'` resolve caixa e **não** resolve
 * acento: quem digita "joao" no balcão não acha "João". A alternativa seria a extensão
 * `unaccent` do Postgres, que obrigaria a busca a virar SQL cru — e SQL cru sai de baixo da
 * Prisma Client Extension, que é quem injeta o `tenantId`. Trocar isolamento de tenant por
 * conveniência de busca é um mau negócio, então a normalização é da aplicação: a coluna
 * `search_name` guarda esta chave, e a consulta continua pelo query builder.
 *
 * NFD separa a letra do diacrítico; o `\p{Diacritic}` então remove só a marca, preservando
 * qualquer alfabeto que não use acento latino.
 */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * O cabeçalho de tipo só faz sentido quando existe corpo para tipar.
 *
 * Os hooks põem `content-type: application/json` em toda chamada, porque quase toda tem corpo.
 * No `DELETE` não tem — e o Fastify, vendo o tipo declarado e nenhum corpo, recusa com 400
 * antes de chegar à rota. O sintoma é traiçoeiro: a tela diz "não foi possível concluir", o
 * servidor responde em dois milissegundos e nenhum erro de negócio aparece no log, porque a
 * requisição nunca chegou lá.
 *
 * Fica no caminho por onde toda chamada passa, e não em cada hook: o mesmo padrão está em
 * vários, e o próximo `DELETE` escrito herdaria o defeito.
 */
export function semCorpoSemTipo(init: RequestInit): RequestInit {
  if (init.body !== undefined && init.body !== null) return init;
  if (init.headers === undefined) return init;

  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) return init;

  headers.delete('content-type');
  return { ...init, headers };
}

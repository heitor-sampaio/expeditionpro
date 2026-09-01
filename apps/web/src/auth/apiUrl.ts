/**
 * SEC-16 — para onde a chamada vai quando o front não está na mesma origem da API.
 *
 * Em desenvolvimento o front chama `/v1/...` e o proxy do Vite encaminha para o Fastify:
 * mesma origem, nada de CORS. Publicado como serviço separado no Railway, a origem do front
 * passa a ser a dele — e um `/v1/...` relativo bateria no próprio servidor de arquivos,
 * devolvendo o `index.html` com 200. O erro apareceria longe dali, no `res.json()`.
 *
 * Por isso a base é explícita e vazia por padrão: quem não configura nada segue no
 * comportamento de mesma origem, que é o certo em dev e continua certo se um dia o front
 * for servido pela própria API.
 */
export function apiUrl(base: string | undefined, path: string): string {
  if (!base) return path;
  // Barra final na variável de ambiente é erro de digitação frequente demais para punir.
  return `${base.replace(/\/+$/, '')}${path}`;
}

/** A base configurada no build. `VITE_` é o prefixo que o Vite injeta no bundle. */
export const API_BASE: string = import.meta.env['VITE_API_URL'] ?? '';

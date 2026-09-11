import { API_BASE, apiUrl } from '../auth/apiUrl.js';

/**
 * IN-25 — o `fetch` da superfície pública.
 *
 * Existe separado do `auth/api.ts` de propósito, e não por falta de reuso: aquele injeta
 * `Authorization`, tenta renovar a sessão num 401 e, falhando, **desloga**. Um estranho vindo
 * de um anúncio não tem sessão para renovar nem para perder — passar por lá acordaria o cliente
 * de autenticação e transformaria um erro de rede num `signOut`.
 *
 * Aqui não há token, não há retentativa e não há efeito nenhum sobre a sessão de ninguém.
 */
export function publicApi(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(API_BASE, path), init);
}

/**
 * O tenant de quem é o link. Fica na publicação, e não na URL: hoje há um tenant só, e um
 * segmento a mais no link seria ruído para quem cola o endereço num botão.
 *
 * Quando o segundo tenant chegar, o caminho vira `/inscricao/:tenantSlug` e os links antigos
 * continuam valendo — este valor passa a ser só o padrão.
 */
export const PUBLIC_TENANT_SLUG: string = import.meta.env['VITE_PUBLIC_TENANT_SLUG'] ?? 'drk';

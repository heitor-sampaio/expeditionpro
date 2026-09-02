import { apiUrl } from '../auth/apiUrl.js';

/**
 * O endereço que um provedor externo chama, copiado à mão desta tela para o painel dele.
 *
 * Precisa ser absoluto: caminho relativo colado lá não é chamado por ninguém, e a falha é
 * silenciosa — cobrança paga que nunca aparece como paga (PG-03), mensagem que chega e não
 * entra na caixa (AT-02). Desde o SEC-16 a API tem host próprio, então o padrão sai de
 * `VITE_API_URL`. O túnel de desenvolvimento (`VITE_PUBLIC_API_URL`) tem precedência porque é
 * o único caso em que os dois divergem.
 */
function webhookUrl(publicBase: string | undefined, apiBase: string, path: string): string {
  return apiUrl(publicBase || apiBase, path);
}

export function asaasWebhookUrl(publicBase: string | undefined, apiBase: string): string {
  return webhookUrl(publicBase, apiBase, '/v1/webhooks/asaas/drk');
}

/**
 * AT-02 — com `token`, o segredo vai **dentro da URL**.
 *
 * Não é o desenho preferido: segredo em cabeçalho não passa por log de proxy, histórico de
 * navegador nem print de tela. É o que resta quando o provedor não tem campo de cabeçalho —
 * a Evolution instalada aqui só tem campo de URL —, e um webhook público sem autenticação
 * nenhuma não é alternativa. A URL inteira passa a ser credencial, e a tela avisa isso.
 */
export function evolutionWebhookUrl(
  publicBase: string | undefined,
  apiBase: string,
  token?: string,
): string {
  const base = '/v1/webhooks/evolution/drk';
  // Escapa o segredo: ele é gerado em base64url, mas um segredo com barra dentro quebraria o
  // caminho em silêncio — e o sintoma seria um 401 sem explicação.
  const caminho = token ? `${base}/${encodeURIComponent(token)}` : base;
  return webhookUrl(publicBase, apiBase, caminho);
}

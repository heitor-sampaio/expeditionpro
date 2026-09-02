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

export function evolutionWebhookUrl(publicBase: string | undefined, apiBase: string): string {
  return webhookUrl(publicBase, apiBase, '/v1/webhooks/evolution/drk');
}

import { apiUrl } from '../auth/apiUrl.js';

const WEBHOOK_PATH = '/v1/webhooks/asaas/drk';

/**
 * PG-03 — o endereço que o ASAAS chama, copiado à mão desta tela para o painel deles.
 *
 * Precisa ser absoluto: caminho relativo colado lá não é chamado por ninguém, e a falha é
 * silenciosa — cobranças pagas que nunca aparecem como pagas. Desde o SEC-16 a API tem host
 * próprio, então o padrão sai de `VITE_API_URL`. O túnel de desenvolvimento
 * (`VITE_PUBLIC_API_URL`) tem precedência porque é o único caso em que os dois divergem.
 */
export function asaasWebhookUrl(publicBase: string | undefined, apiBase: string): string {
  return apiUrl(publicBase || apiBase, WEBHOOK_PATH);
}

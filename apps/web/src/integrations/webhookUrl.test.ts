import { describe, expect, it } from 'vitest';
import { asaasWebhookUrl } from './webhookUrl.js';

/**
 * PG-03 — o endereço que o ASAAS chama é copiado à mão desta tela para o painel deles.
 *
 * Ele precisa ser absoluto: um caminho relativo colado lá não é chamado por ninguém, e a
 * falha é a pior possível — cobranças pagas que nunca aparecem como pagas, sem erro em
 * lugar nenhum. Desde o SEC-16 a API tem host próprio (`VITE_API_URL`), então esse valor
 * deixa de precisar de uma segunda variável em produção. `VITE_PUBLIC_API_URL` continua
 * existindo para o único caso em que os dois divergem: o túnel de desenvolvimento
 * (cloudflared, ngrok) apontando para a API local.
 */
describe('PG-03: URL do webhook do ASAAS', () => {
  it('usa o host da API quando não há túnel configurado', () => {
    expect(asaasWebhookUrl(undefined, 'https://api.exemplo.app')).toBe(
      'https://api.exemplo.app/v1/webhooks/asaas/drk',
    );
  });

  it('o túnel tem precedência — é o caso de desenvolvimento', () => {
    expect(asaasWebhookUrl('https://tunel.trycloudflare.com', 'https://api.exemplo.app')).toBe(
      'https://tunel.trycloudflare.com/v1/webhooks/asaas/drk',
    );
  });

  it('sem nenhum dos dois, devolve o caminho relativo — dev de mesma origem', () => {
    expect(asaasWebhookUrl(undefined, '')).toBe('/v1/webhooks/asaas/drk');
  });

  it('barra final não vira barra dupla', () => {
    expect(asaasWebhookUrl('https://tunel.exemplo/', '')).toBe(
      'https://tunel.exemplo/v1/webhooks/asaas/drk',
    );
  });
});

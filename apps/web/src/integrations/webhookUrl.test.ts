import { describe, expect, it } from 'vitest';
import { asaasWebhookUrl, evolutionWebhookUrl } from './webhookUrl.js';

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

/**
 * AT-02 — o mesmo raciocínio, no webhook da Evolution: o endereço é copiado desta tela para o
 * painel da instância. Caminho relativo colado lá também não é chamado por ninguém, e a falha
 * é igualmente silenciosa — mensagem que chega e não aparece na caixa.
 */
describe('AT-02: URL do webhook da Evolution', () => {
  it('usa o host da API quando não há túnel configurado', () => {
    expect(evolutionWebhookUrl(undefined, 'https://api.exemplo.app')).toBe(
      'https://api.exemplo.app/v1/webhooks/evolution/drk',
    );
  });

  it('o túnel tem precedência — é o caso de desenvolvimento', () => {
    expect(evolutionWebhookUrl('https://tunel.trycloudflare.com', 'https://api.exemplo.app')).toBe(
      'https://tunel.trycloudflare.com/v1/webhooks/evolution/drk',
    );
  });
});

/**
 * AT-02 — a Evolution instalada aqui não tem campo de cabeçalho no webhook: só URL. Então o
 * segredo vai no último segmento do caminho, e **a URL inteira vira credencial** — é ela que a
 * tela manda copiar, com o aviso que isso merece.
 */
describe('AT-02: URL do webhook com o segredo dentro', () => {
  it('põe o segredo como último segmento', () => {
    expect(evolutionWebhookUrl(undefined, 'https://api.exemplo.app', 'S3GR3D0')).toBe(
      'https://api.exemplo.app/v1/webhooks/evolution/drk/S3GR3D0',
    );
  });

  it('sem segredo, devolve o endereço sem segmento sobrando', () => {
    expect(evolutionWebhookUrl(undefined, 'https://api.exemplo.app')).toBe(
      'https://api.exemplo.app/v1/webhooks/evolution/drk',
    );
  });

  it('segredo com caractere de URL é escapado — senão o caminho quebra', () => {
    expect(evolutionWebhookUrl(undefined, 'https://api.exemplo.app', 'a/b?c')).toBe(
      'https://api.exemplo.app/v1/webhooks/evolution/drk/a%2Fb%3Fc',
    );
  });
});

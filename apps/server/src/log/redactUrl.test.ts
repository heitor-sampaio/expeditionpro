import { describe, expect, it } from 'vitest';
import { redactUrl } from './redactUrl.js';

/**
 * SEC-01 — o endereço da requisição vai para o log, e às vezes ele carrega segredo.
 *
 * A redação que existia nomeava `req.query.q`, e **não fazia nada**: o serializador padrão do
 * Fastify não emite `query`, emite `url` — com a query string dentro. Uma busca de cliente por
 * `?q=90000010057` ficava em claro no log, que tem retenção longa e público mais amplo que o
 * back-office. Foi verificado num servidor de teste antes deste arquivo existir.
 *
 * O segundo caso é o segredo do webhook no caminho (AT-02): existe porque nem todo provedor
 * deixa configurar cabeçalho, e URL com segredo dentro é o que sobra. Ele **precisa** sair do
 * nosso log — do log do proxy, que é de outra casa, não temos como tirar.
 */
describe('SEC-01: o que é apagado do endereço antes de virar log', () => {
  it('apaga o termo de busca — é por onde CPF e telefone entram', () => {
    expect(redactUrl('/v1/customers?q=90000010057')).toBe('/v1/customers?q=[redacted]');
  });

  it('apaga o segredo do webhook no caminho', () => {
    expect(redactUrl('/v1/webhooks/evolution/drk/S3GR3D0-longo')).toBe(
      '/v1/webhooks/evolution/drk/[redacted]',
    );
  });

  it('o webhook sem segredo no caminho continua legível — é o que identifica a rota', () => {
    expect(redactUrl('/v1/webhooks/asaas/drk')).toBe('/v1/webhooks/asaas/drk');
  });

  it('preserva o que não é segredo: rota, paginação, filtro comum', () => {
    expect(redactUrl('/v1/charges?limit=50&status=paid')).toBe('/v1/charges?limit=50&status=paid');
  });

  it('apaga só o valor sensível quando há mais de um parâmetro', () => {
    expect(redactUrl('/v1/customers?q=Ana&limit=20')).toBe('/v1/customers?q=[redacted]&limit=20');
  });

  it('apaga nomes conhecidos de credencial em query, venham de onde vierem', () => {
    expect(redactUrl('/qualquer?token=abc&apikey=def&secret=ghi')).toBe(
      '/qualquer?token=[redacted]&apikey=[redacted]&secret=[redacted]',
    );
  });

  it('endereço sem query nem segredo passa intacto', () => {
    expect(redactUrl('/v1/itineraries')).toBe('/v1/itineraries');
  });

  it('endereço estranho não derruba o log — na dúvida, devolve como veio', () => {
    expect(redactUrl('')).toBe('');
    expect(redactUrl('não é uma url')).toBe('não é uma url');
  });
});

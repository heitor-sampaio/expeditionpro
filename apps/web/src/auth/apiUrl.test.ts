import { describe, expect, it } from 'vitest';
import { apiUrl } from './apiUrl.js';

/**
 * SEC-16 — o front publicado em serviço separado precisa saber onde está a API.
 *
 * O modo de falha que este teste tranca é silencioso: sem base, `fetch('/v1/customers')`
 * no domínio do front acerta o servidor de arquivos estáticos, que responde o `index.html`
 * com **200**. O código de status diz sucesso e o corpo é HTML — o erro aparece longe dali,
 * no `res.json()`, como sintaxe inválida.
 */
describe('SEC-16: base da API no front', () => {
  it('sem base configurada, mantém o caminho relativo — é o proxy do Vite em dev', () => {
    expect(apiUrl(undefined, '/v1/customers')).toBe('/v1/customers');
    expect(apiUrl('', '/v1/customers')).toBe('/v1/customers');
  });

  it('com base, prefixa a origem da API', () => {
    expect(apiUrl('https://api.exemplo.app', '/v1/customers')).toBe(
      'https://api.exemplo.app/v1/customers',
    );
  });

  it('barra final na base não vira barra dupla', () => {
    expect(apiUrl('https://api.exemplo.app/', '/v1/customers')).toBe(
      'https://api.exemplo.app/v1/customers',
    );
  });

  it('preserva query string — busca e paginação passam por aqui', () => {
    expect(apiUrl('https://api.exemplo.app', '/v1/customers?q=ana&page=2')).toBe(
      'https://api.exemplo.app/v1/customers?q=ana&page=2',
    );
  });
});

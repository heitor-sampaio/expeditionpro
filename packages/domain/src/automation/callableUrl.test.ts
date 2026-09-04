import { describe, expect, it } from 'vitest';
import { InvalidCallableUrlError, parseCallableUrl } from './callableUrl.js';

/**
 * AU-21 — a URL que uma automação pode chamar.
 *
 * Um bloco que chama endereço arbitrário é a porta mais perigosa que este sistema já teve: quem
 * desenha a automação passa a mandar o servidor bater onde quiser, com a rede que o servidor
 * tem. O alvo clássico não é a internet — é **o que só o servidor alcança**: o metadado da
 * nuvem em 169.254.169.254, o Postgres em 10.x, a própria API em localhost, que confiaria na
 * chamada por vir de dentro.
 *
 * Por isso a regra é lista-negra explícita e `https` obrigatório: não é o desenho que decide
 * onde dá para bater, é isto aqui.
 */

describe('AU-21: endereços que a automação pode chamar', () => {
  it('https para host público passa', () => {
    expect(parseCallableUrl('https://api.exemplo.com.br/hooks/123').hostname).toBe(
      'api.exemplo.com.br',
    );
  });

  it('porta e caminho são preservados', () => {
    const url = parseCallableUrl('https://api.exemplo.com:8443/webhook?x=1');
    expect(url.port).toBe('8443');
    expect(url.pathname).toBe('/webhook');
  });

  /** Sem TLS, o corpo com dado de cliente atravessa a rede em texto claro. */
  it('http é recusado', () => {
    expect(() => parseCallableUrl('http://api.exemplo.com')).toThrow(InvalidCallableUrlError);
  });

  it('endereço sem forma de URL é recusado', () => {
    expect(() => parseCallableUrl('api.exemplo.com')).toThrow(InvalidCallableUrlError);
    expect(() => parseCallableUrl('')).toThrow(InvalidCallableUrlError);
  });

  it.each([
    ['https://localhost/x'],
    ['https://127.0.0.1/x'],
    ['https://[::1]/x'],
    ['https://10.0.0.5/x'],
    ['https://172.16.4.9/x'],
    ['https://192.168.1.10/x'],
    ['https://169.254.169.254/latest/meta-data/'],
    ['https://algo.local/x'],
    ['https://servico.internal/x'],
  ])('recusa a rede de dentro: %s', (endereco) => {
    expect(() => parseCallableUrl(endereco)).toThrow(InvalidCallableUrlError);
  });

  /** Credencial na URL vaza em log de proxy e em histórico; e é jeito antigo de ofuscar host. */
  it('usuário e senha na URL são recusados', () => {
    expect(() => parseCallableUrl('https://user:senha@api.exemplo.com')).toThrow(
      InvalidCallableUrlError,
    );
  });

  it('outros esquemas são recusados', () => {
    expect(() => parseCallableUrl('file:///etc/passwd')).toThrow(InvalidCallableUrlError);
    expect(() => parseCallableUrl('ftp://exemplo.com')).toThrow(InvalidCallableUrlError);
  });
});

describe('AU-21: o mesmo julgamento sobre um endereço já resolvido', () => {
  /** O host público pode apontar para IP interno: quem resolve o DNS pergunta de novo aqui. */
  it('IP resolvido dentro da rede é recusado', () => {
    expect(() => parseCallableUrl('https://api.exemplo.com', ['10.0.0.7'])).toThrow(
      InvalidCallableUrlError,
    );
  });

  it('IP resolvido público passa', () => {
    expect(parseCallableUrl('https://api.exemplo.com', ['189.1.2.3']).hostname).toBe(
      'api.exemplo.com',
    );
  });

  /** Um dos endereços sendo interno já basta: o cliente HTTP pode escolher qualquer um. */
  it('basta um endereço interno na lista para recusar', () => {
    expect(() => parseCallableUrl('https://api.exemplo.com', ['189.1.2.3', '127.0.0.1'])).toThrow(
      InvalidCallableUrlError,
    );
  });
});

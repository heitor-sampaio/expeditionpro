import { describe, expect, it } from 'vitest';
import { clientIp } from './clientIp.js';

/**
 * AT-02 · SEC — **de quem é** a conexão, quando ela chega por um proxy.
 *
 * Este arquivo existe por causa de uma armadilha. O servidor roda com `trustProxy` ligado, e
 * nesse modo o `request.ip` do Fastify devolve o **primeiro** endereço do `x-forwarded-for`.
 * Esse cabeçalho é um texto que o cliente manda: quem quisesse passar pela cerca de origem
 * bastava enviar `x-forwarded-for: 69.62.88.81` e o servidor concordaria.
 *
 * O endereço confiável é o **último** da lista: é o que o proxy da Railway acrescenta ao ver a
 * conexão de verdade. Tudo que vem antes foi escrito por quem chamou, e não vale nada.
 *
 * A cerca de origem (AT-02) usa esta função, não o `request.ip`.
 */
describe('AT-02: o endereço de quem realmente conectou', () => {
  it('sem proxy nenhum, é o endereço do socket', () => {
    expect(clientIp(undefined, '69.62.88.81')).toBe('69.62.88.81');
  });

  it('com um proxy, é o que ele registrou', () => {
    expect(clientIp('69.62.88.81', '10.0.0.7')).toBe('69.62.88.81');
  });

  /** O ataque que a função existe para impedir. */
  it('cabeçalho forjado pelo chamador não passa por cima do que o proxy viu', () => {
    expect(clientIp('69.62.88.81, 203.0.113.9', '10.0.0.7')).toBe('203.0.113.9');
  });

  it('lista com espaços e entradas vazias não confunde', () => {
    expect(clientIp('  69.62.88.81 ,  , 203.0.113.9  ', '10.0.0.7')).toBe('203.0.113.9');
  });

  it('cabeçalho repetido chega como lista — vale o último mesmo assim', () => {
    expect(clientIp(['1.1.1.1', '2.2.2.2, 203.0.113.9'], '10.0.0.7')).toBe('203.0.113.9');
  });

  it('cabeçalho vazio cai no socket', () => {
    expect(clientIp('   ', '10.0.0.7')).toBe('10.0.0.7');
  });

  it('sem endereço nenhum, devolve vazio — e vazio não entra em cerca', () => {
    expect(clientIp(undefined, undefined)).toBe('');
  });
});

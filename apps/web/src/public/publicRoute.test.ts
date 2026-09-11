import { describe, expect, it } from 'vitest';
import { resolvePublicRoute } from './publicRoute.js';

/**
 * IN-25 — o link do site de apresentação, lido antes de qualquer outra coisa.
 *
 * É o que decide se a pessoa vê a página pública de inscrição ou o portão de login. Roda
 * **antes** do `useAuth`, de propósito: um estranho vindo de um anúncio não deve acordar o
 * cliente de autenticação nem correr o risco de ser deslogado por uma sessão que ele não tem.
 *
 * Função pura porque é a única decisão do arquivo que a bifurca — o componente que ela escolhe
 * não tem teste, e o que não tem teste precisa não ter decisão dentro.
 */
describe('IN-25: o link público é reconhecido', () => {
  it('reconhece o caminho da inscrição, com roteiro e saída', () => {
    const rota = resolvePublicRoute('/inscricao', '?roteiro=coxilha-rica&saida=jan-27');

    expect(rota).toEqual({ kind: 'inscricao', roteiro: 'coxilha-rica', saida: 'jan-27' });
  });

  /** Barra no fim vem de encurtador e de quem copia da barra do navegador. */
  it('aceita a barra no fim', () => {
    expect(resolvePublicRoute('/inscricao/', '?roteiro=x')).toMatchObject({ kind: 'inscricao' });
  });

  /**
   * Sem `saida`, a página abre com o roteiro e todas as datas — é o link que alguém pôs num
   * post genérico, e ele não pode fechar a porta.
   */
  it('sem saída, ainda é a página de inscrição', () => {
    const rota = resolvePublicRoute('/inscricao', '?roteiro=coxilha-rica');

    expect(rota).toEqual({ kind: 'inscricao', roteiro: 'coxilha-rica', saida: undefined });
  });

  /**
   * **Sem roteiro não é rota pública.** `/inscricao` pelado não tem o que mostrar, e cair no
   * login é melhor que uma página vazia pedindo que a pessoa adivinhe o que fazer.
   */
  it('sem roteiro, não é rota pública', () => {
    expect(resolvePublicRoute('/inscricao', '')).toBeNull();
  });

  it.each(['/', '/app', '/portal', '/inscricao-antiga', '/inscricaoX'])(
    '%s não é a página pública',
    (caminho) => {
      expect(resolvePublicRoute(caminho, '?roteiro=x')).toBeNull();
    },
  );

  /** Parâmetro repetido: vale o primeiro, que é o que o navegador entrega em `get`. */
  it('parâmetro repetido não confunde', () => {
    const rota = resolvePublicRoute('/inscricao', '?roteiro=a&roteiro=b');
    expect(rota).toMatchObject({ roteiro: 'a' });
  });

  /** Espaço e acento chegam percent-encoded; quem decodifica é o próprio `URLSearchParams`. */
  it('valor codificado chega decodificado', () => {
    expect(resolvePublicRoute('/inscricao', '?roteiro=vale%20europeu')).toMatchObject({
      roteiro: 'vale europeu',
    });
  });

  /** Roteiro em branco é o mesmo que roteiro ausente: não há o que abrir. */
  it('roteiro em branco não abre a página', () => {
    expect(resolvePublicRoute('/inscricao', '?roteiro=%20%20')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { corpoDaInscricao, formularioVazio, podeEnviar } from './enrollmentForm.js';

/**
 * IN-25b — o que a página monta e quando ela deixa enviar.
 *
 * A tela não tem teste; então tudo o que ela **decide** sai daqui. Sem isto, a regra de "pode
 * enviar" viveria espalhada por três `&&` dentro do JSX, onde ninguém a lê e nada a cobra.
 */

const cheio = () => ({
  ...formularioVazio(),
  nome: 'Vanessa Santos',
  cpf: '900.000.100-57',
  nascimento: '1989-01-14',
  email: 'vanessa@exemplo.com',
  telefone: '48999998877',
  aceite: true,
});

describe('IN-25b: quando o botão de enviar acende', () => {
  it('com a saída escolhida e o responsável completo, acende', () => {
    expect(podeEnviar(cheio(), 'g-jan')).toBe(true);
  });

  /** Sem saída não há preço, não há faixa etária e não há o que alocar. */
  it('sem saída escolhida, não', () => {
    expect(podeEnviar(cheio(), null)).toBe(false);
  });

  it.each(['nome', 'cpf', 'nascimento', 'email', 'telefone'] as const)('sem %s, não', (campo) => {
    expect(podeEnviar({ ...cheio(), [campo]: '  ' }, 'g-jan')).toBe(false);
  });

  /**
   * DOC-04 · SEC-11 — o aceite é capturado **na inscrição**, e cobre o tratamento de dado de
   * criança que o responsável está informando. Sem ele não há base para guardar o que se pediu.
   */
  it('sem o aceite do termo, não', () => {
    expect(podeEnviar({ ...cheio(), aceite: false }, 'g-jan')).toBe(false);
  });

  /**
   * Acompanhante pela metade trava o envio em vez de ir incompleto: sem o nascimento não há
   * faixa etária, e sem faixa etária o preço da saída sai errado (§3.4).
   */
  it('acompanhante começado e não terminado trava o envio', () => {
    const comMeio = {
      ...cheio(),
      acompanhantes: [{ nome: 'Ana Prado', cpf: '', nascimento: '' }],
    };
    expect(podeEnviar(comMeio, 'g-jan')).toBe(false);
  });
});

describe('IN-25b: o corpo que vai para o servidor', () => {
  it('leva o roteiro, a saída e o responsável no formato canônico', () => {
    const corpo = corpoDaInscricao(cheio(), {
      roteiro: 'coxilha-rica',
      saida: 'jan-27',
      groupId: 'g-jan',
    });

    expect(corpo).toMatchObject({
      roteiro: 'coxilha-rica',
      saida: 'jan-27',
      groupId: 'g-jan',
      responsible: {
        full_name: 'Vanessa Santos',
        cpf: '900.000.100-57',
        birth_date: '1989-01-14',
        email: 'vanessa@exemplo.com',
        phone: '48999998877',
      },
      consent: true,
    });
  });

  /** Uma linha de acompanhante em branco é ruído de tela, não uma pessoa. */
  it('acompanhante em branco não vai no corpo', () => {
    const corpo = corpoDaInscricao(
      { ...cheio(), acompanhantes: [{ nome: '', cpf: '', nascimento: '' }] },
      { roteiro: 'coxilha-rica', groupId: 'g-jan' },
    );

    expect(corpo['companions']).toBeUndefined();
  });

  it('acompanhante preenchido vai no formato canônico', () => {
    const corpo = corpoDaInscricao(
      {
        ...cheio(),
        acompanhantes: [{ nome: 'Ana Prado', cpf: '111.444.777-35', nascimento: '2015-03-22' }],
      },
      { roteiro: 'coxilha-rica', groupId: 'g-jan' },
    );

    expect(corpo['companions']).toEqual([
      { full_name: 'Ana Prado', cpf: '111.444.777-35', birth_date: '2015-03-22' },
    ]);
  });

  /**
   * O contrato do servidor é fechado (`.strict()`): mandar uma chave vazia seria 400 na cara de
   * quem preencheu tudo certo. Bloco não preenchido simplesmente não vai.
   */
  it('veículo e endereço em branco não viajam', () => {
    const corpo = corpoDaInscricao(cheio(), { roteiro: 'coxilha-rica', groupId: 'g-jan' });

    expect(corpo['vehicle']).toBeUndefined();
    expect(corpo['address']).toBeUndefined();
  });

  it('veículo preenchido vai no formato canônico', () => {
    const corpo = corpoDaInscricao(
      { ...cheio(), marca: 'Ford', modelo: 'Ranger', placa: 'SFG0H61' },
      { roteiro: 'coxilha-rica', groupId: 'g-jan' },
    );

    expect(corpo['vehicle']).toEqual({ brand: 'Ford', model: 'Ranger', plate: 'SFG0H61' });
  });

  /** Link sem mês: o corpo não leva `saida`, e o servidor recusaria uma string vazia. */
  it('sem mês no link, o corpo não leva saída', () => {
    const corpo = corpoDaInscricao(cheio(), { roteiro: 'coxilha-rica', groupId: 'g-jan' });
    expect(corpo['saida']).toBeUndefined();
  });
});

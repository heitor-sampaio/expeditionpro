import { describe, expect, it } from 'vitest';
import { phoneVariants } from './phoneVariants.js';

/**
 * AT-06 — o nono dígito, que o Brasil acrescentou aos celulares e o WhatsApp nem sempre usa.
 *
 * A mesma pessoa é `55 48 98888-8888` na ficha do cliente e `55 48 8888-8888` no que a
 * Evolution manda. Comparando texto, nenhuma conversa casa com nenhuma ficha — e o sintoma é
 * o pior possível: **silêncio**. Ninguém vê erro, todo contato parece novo, e a equipe atende
 * cliente antigo como desconhecido.
 *
 * A função devolve as duas grafias do mesmo número para quem precisar procurar pelas duas.
 * Ela **não escolhe uma** e não normaliza o que está guardado: o número que a instância usa é
 * o que disca, e reescrevê-lo para uma forma "certa" poderia impedir a mensagem de sair.
 */
describe('AT-06: as duas grafias do celular brasileiro', () => {
  it('celular sem o nono dígito ganha a grafia com ele', () => {
    expect(phoneVariants('554888888888')).toEqual(['554888888888', '5548988888888']);
  });

  it('celular com o nono dígito ganha a grafia sem ele', () => {
    expect(phoneVariants('5548988888888')).toEqual(['5548988888888', '554888888888']);
  });

  /**
   * Fixo não tem nono dígito nenhum: no Brasil ele começa com 2 a 5. Inventar um 9 ali criaria
   * um número que não existe e faria a busca casar com quem não é.
   */
  it('telefone fixo não ganha variação', () => {
    expect(phoneVariants('554832221111')).toEqual(['554832221111']);
    expect(phoneVariants('554821112222')).toEqual(['554821112222']);
  });

  it('número de fora do Brasil fica como está', () => {
    expect(phoneVariants('12125551234')).toEqual(['12125551234']);
  });

  it('máscara e espaços não atrapalham — compara só dígito', () => {
    expect(phoneVariants('+55 (48) 98888-8888')).toEqual(['5548988888888', '554888888888']);
  });

  it('texto que não é telefone volta como veio, sem inventar variação', () => {
    expect(phoneVariants('')).toEqual([]);
    expect(phoneVariants('187654321098765')).toEqual(['187654321098765']);
  });

  /** Sem DDI, o número ainda é reconhecível: é como muita ficha antiga foi cadastrada. */
  it('número sem o 55 na frente também rende as duas grafias', () => {
    expect(phoneVariants('48988888888')).toEqual(['48988888888', '4888888888']);
  });
});

import { describe, expect, it } from 'vitest';
import { matchesSearch } from './searchConversations.js';

/**
 * AT-07 — achar um contato na caixa.
 *
 * Duas formas de procurar porque são as duas que a equipe tem na cabeça: o **nome**, quando
 * lembra de quem é, e o **telefone**, quando está com o número na frente — o cliente ligou, ou
 * ele veio numa ficha.
 *
 * A normalização do nome é a mesma da busca de clientes (`searchKey`, CL-02): quem digita
 * "jose" tem que achar "José". Duas normalizações diferentes no mesmo sistema significam que a
 * mesma busca acha em uma tela e não acha na outra.
 */

const ana = { displayName: 'Ana Prado', phone: '5548999998877' };
const jose = { displayName: 'José Antônio', phone: '5511988887777' };
const semNome = { displayName: null, phone: '5548912345678' };
const semNumero = { displayName: 'Contato do Instagram', phone: null };

describe('AT-07: busca na lista de conversas', () => {
  it('sem termo, tudo passa — o campo em branco não filtra nada', () => {
    expect(matchesSearch(ana, '')).toBe(true);
    expect(matchesSearch(ana, '   ')).toBe(true);
  });

  it('acha pelo começo do nome', () => {
    expect(matchesSearch(ana, 'ana')).toBe(true);
  });

  it('acha por um pedaço do meio — ninguém digita o nome inteiro', () => {
    expect(matchesSearch(ana, 'prado')).toBe(true);
  });

  it('acento não atrapalha, nos dois sentidos', () => {
    expect(matchesSearch(jose, 'jose')).toBe(true);
    expect(matchesSearch(jose, 'antônio')).toBe(true);
  });

  it('caixa não atrapalha', () => {
    expect(matchesSearch(ana, 'ANA')).toBe(true);
  });

  it('nome que não é dela não acha', () => {
    expect(matchesSearch(ana, 'tammy')).toBe(false);
  });

  it('acha pelo telefone inteiro', () => {
    expect(matchesSearch(ana, '5548999998877')).toBe(true);
  });

  /** Quem procura pelo número digita o que está vendo, com máscara e tudo. */
  it('acha com o número mascarado', () => {
    expect(matchesSearch(ana, '(48) 99999-8877')).toBe(true);
  });

  it('acha pelo fim do número — é o pedaço que se decora', () => {
    expect(matchesSearch(ana, '8877')).toBe(true);
  });

  it('número de outra pessoa não acha', () => {
    expect(matchesSearch(ana, '91234')).toBe(false);
  });

  it('conversa sem nome ainda é achada pelo número', () => {
    expect(matchesSearch(semNome, '91234')).toBe(true);
  });

  it('conversa sem número ainda é achada pelo nome', () => {
    expect(matchesSearch(semNumero, 'instagram')).toBe(true);
  });

  /**
   * O termo com letra não vira busca de número, e vice-versa: procurar "ana" não pode achar
   * quem tem "ana" em lugar nenhum só porque o telefone dela tem algum dígito em comum.
   */
  it('termo de letra não casa por telefone', () => {
    expect(matchesSearch(semNome, 'ana')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '@expedition/domain';
import { selectGroupForMonth, type PublicGroup } from './publicItinerarySelection.js';

/**
 * IN-25 — qual saída o link escolheu, e o que oferecer quando ele não escolheu nenhuma.
 *
 * O botão do site carrega `?saida=jan-27`. Um anúncio, porém, continua rodando depois de a
 * saída fechar: quem clica em março num link de janeiro não pode cair num "link inválido" e ir
 * embora. Mostrar as próximas datas do mesmo roteiro é o que transforma um link velho num
 * interessado.
 */

const HOJE = parseLocalDate('2026-09-11');

const saida = (id: string, inicio: string): PublicGroup => ({
  groupId: id,
  name: `Saída ${id}`,
  startDate: parseLocalDate(inicio),
  endDate: parseLocalDate(inicio),
  vacancies: null,
});

describe('IN-25: a saída que o link escolheu', () => {
  const abertas = [
    saida('g-jan', '2027-01-15'),
    saida('g-fev', '2027-02-20'),
    saida('g-mar', '2027-03-10'),
  ];

  it('o mês do link casa a saída daquele mês', () => {
    const { match } = selectGroupForMonth(abertas, { year: 2027, month: 1 }, HOJE);
    expect(match?.groupId).toBe('g-jan');
  });

  /** Escolhida a saída, as outras continuam à mão: quem clicou errado troca sem recomeçar. */
  it('as outras datas vêm junto, em ordem', () => {
    const { alternatives } = selectGroupForMonth(abertas, { year: 2027, month: 1 }, HOJE);
    expect(alternatives.map((g) => g.groupId)).toEqual(['g-fev', 'g-mar']);
  });

  it('mês sem saída não casa nada, e oferece todas as abertas', () => {
    const { match, alternatives } = selectGroupForMonth(abertas, { year: 2027, month: 7 }, HOJE);
    expect(match).toBeNull();
    expect(alternatives.map((g) => g.groupId)).toEqual(['g-jan', 'g-fev', 'g-mar']);
  });

  /** Link sem `saida`, ou com um mês que não se lê: a página abre com o roteiro e as datas. */
  it('sem mês nenhum, oferece todas as abertas', () => {
    const { match, alternatives } = selectGroupForMonth(abertas, null, HOJE);
    expect(match).toBeNull();
    expect(alternatives).toHaveLength(3);
  });

  /**
   * Saída que já aconteceu não é alternativa — e nem casa, mesmo que o mês bata. Um link de
   * janeiro do ano passado abriria a inscrição para uma viagem que já voltou.
   */
  it('saída passada não casa e não é oferecida', () => {
    const comPassada = [saida('g-velha', '2026-01-10'), ...abertas];

    const { match, alternatives } = selectGroupForMonth(comPassada, { year: 2026, month: 1 }, HOJE);

    expect(match).toBeNull();
    expect(alternatives.map((g) => g.groupId)).not.toContain('g-velha');
  });

  it('roteiro sem saída aberta nenhuma não oferece nada', () => {
    const { match, alternatives } = selectGroupForMonth([], { year: 2027, month: 1 }, HOJE);
    expect(match).toBeNull();
    expect(alternatives).toEqual([]);
  });

  /**
   * Duas saídas no mesmo mês acontecem (um feriado e um fim de semana). Casa a **primeira**, e
   * a outra continua na lista ao lado — quem quer a segunda a escolhe, em vez de o sistema
   * decidir por ela em silêncio.
   */
  it('duas no mesmo mês: casa a primeira e mantém a outra à vista', () => {
    const duas = [saida('g-1', '2027-01-05'), saida('g-2', '2027-01-25')];

    const { match, alternatives } = selectGroupForMonth(duas, { year: 2027, month: 1 }, HOJE);

    expect(match?.groupId).toBe('g-1');
    expect(alternatives.map((g) => g.groupId)).toEqual(['g-2']);
  });

  it('a lista sai ordenada por data, venha como vier', () => {
    const fora = [saida('g-mar', '2027-03-10'), saida('g-jan', '2027-01-15')];
    const { alternatives } = selectGroupForMonth(fora, null, HOJE);
    expect(alternatives.map((g) => g.groupId)).toEqual(['g-jan', 'g-mar']);
  });
});

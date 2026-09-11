import { describe, expect, it } from 'vitest';
import { saidasDoLink } from './saidasDoLink.js';
import type { PublicEnrollmentLinkView, PublicSaida } from './usePublicEnrollmentLink.js';

const saida = (groupId: string, startDate: string): PublicSaida => ({
  groupId,
  name: groupId,
  startDate,
  endDate: startDate,
  vacancies: null,
});

const view = (parcial: Partial<PublicEnrollmentLinkView>): PublicEnrollmentLinkView => ({
  itineraryName: 'Coxilha Rica',
  itinerarySlug: 'coxilha-rica',
  saidaReconhecida: true,
  match: null,
  alternatives: [],
  ...parcial,
});

describe('IN-25: as saídas que a página mostra', () => {
  /**
   * O caso do link completo: uma saída, e nada a escolher. O rádio sozinho seria um controle
   * que não controla nada — pior, insinuaria que há outra opção em algum lugar.
   */
  it('link que casou a data mostra uma saída, sem escolha a fazer', () => {
    const { opcoes, escolhaAberta } = saidasDoLink(
      view({ match: saida('g-nov', '2026-11-20'), alternatives: [] }),
    );

    expect(opcoes.map((s) => s.groupId)).toEqual(['g-nov']);
    expect(escolhaAberta).toBe(false);
  });

  it('link sem data abre a escolha com todas as saídas', () => {
    const { opcoes, escolhaAberta } = saidasDoLink(
      view({
        match: null,
        alternatives: [saida('g-out', '2026-10-10'), saida('g-nov', '2026-11-20')],
      }),
    );

    expect(opcoes.map((s) => s.groupId)).toEqual(['g-out', 'g-nov']);
    expect(escolhaAberta).toBe(true);
  });

  /** Duas no mesmo mês: o link não desambigua, então a escolha continua aberta. */
  it('a saída casada vem primeiro, e a do mesmo mês continua escolhível', () => {
    const { opcoes, escolhaAberta } = saidasDoLink(
      view({ match: saida('g-1', '2026-11-05'), alternatives: [saida('g-2', '2026-11-25')] }),
    );

    expect(opcoes.map((s) => s.groupId)).toEqual(['g-1', 'g-2']);
    expect(escolhaAberta).toBe(true);
  });

  it('roteiro sem saída aberta nenhuma não mostra lista', () => {
    const { opcoes, escolhaAberta } = saidasDoLink(view({}));

    expect(opcoes).toEqual([]);
    expect(escolhaAberta).toBe(false);
  });
});

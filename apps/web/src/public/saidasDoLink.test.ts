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
      'nov-26',
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
      undefined,
    );

    expect(opcoes.map((s) => s.groupId)).toEqual(['g-out', 'g-nov']);
    expect(escolhaAberta).toBe(true);
  });

  /** Duas no mesmo mês: o link não desambigua, então a escolha continua aberta. */
  it('a saída casada vem primeiro, e a do mesmo mês continua escolhível', () => {
    const { opcoes, escolhaAberta } = saidasDoLink(
      view({ match: saida('g-1', '2026-11-05'), alternatives: [saida('g-2', '2026-11-25')] }),
      'nov-26',
    );

    expect(opcoes.map((s) => s.groupId)).toEqual(['g-1', 'g-2']);
    expect(escolhaAberta).toBe(true);
  });

  it('roteiro sem saída aberta nenhuma não mostra lista', () => {
    const { opcoes, escolhaAberta } = saidasDoLink(view({}), undefined);

    expect(opcoes).toEqual([]);
    expect(escolhaAberta).toBe(false);
  });
});

describe('IN-25: o aviso só aparece quando o link errou a data', () => {
  /**
   * **Link sem data não errou nada.** Ele é o do post genérico, o do perfil, o que alguém
   * mandou no grupo — a pessoa chegou para escolher, e abrir com "a data deste link não está
   * mais aberta" acusa um erro que ninguém cometeu e planta a dúvida de que a expedição
   * acabou.
   */
  it('sem data no link, não há aviso nenhum — só as saídas', () => {
    const { aviso, escolhaAberta } = saidasDoLink(
      view({
        match: null,
        alternatives: [saida('g-out', '2026-10-10'), saida('g-nov', '2026-11-20')],
      }),
      undefined,
    );

    expect(aviso).toBeNull();
    expect(escolhaAberta).toBe(true);
  });

  /** O anúncio que continuou rodando: o link trouxe uma data, e ela fechou. */
  it('data que fechou avisa que fechou', () => {
    const { aviso } = saidasDoLink(
      view({ match: null, alternatives: [saida('g-nov', '2026-11-20')], saidaReconhecida: true }),
      'set-26',
    );

    expect(aviso).toBe('data-fechada');
  });

  /** `xyz-27` passa no formato e não é mês nenhum: é outra frase, porque é outro problema. */
  it('data que não se consegue ler avisa outra coisa', () => {
    const { aviso } = saidasDoLink(
      view({ match: null, alternatives: [saida('g-nov', '2026-11-20')], saidaReconhecida: false }),
      'xyz-27',
    );

    expect(aviso).toBe('data-ilegivel');
  });

  it('data que casou não avisa nada', () => {
    const { aviso } = saidasDoLink(view({ match: saida('g-nov', '2026-11-20') }), 'nov-26');

    expect(aviso).toBeNull();
  });

  /**
   * **Uma opção só fica escolhida sozinha.** Sem isto o botão de enviar trava para sempre no
   * caso mais comum do link sem data: uma saída aberta, nenhum rádio para clicar (porque com
   * uma opção não há escolha) e nenhuma saída selecionada.
   */
  it('opção única já vem escolhida, mesmo sem o link ter pedido', () => {
    const { padrao, escolhaAberta } = saidasDoLink(
      view({ match: null, alternatives: [saida('g-nov', '2026-11-20')] }),
      undefined,
    );

    expect(padrao).toBe('g-nov');
    expect(escolhaAberta).toBe(false);
  });

  it('com várias saídas e nenhuma escolhida pelo link, ninguém escolhe por quem vai', () => {
    const { padrao } = saidasDoLink(
      view({
        match: null,
        alternatives: [saida('g-out', '2026-10-10'), saida('g-nov', '2026-11-20')],
      }),
      undefined,
    );

    expect(padrao).toBeNull();
  });

  it('a saída do link é a escolhida por padrão', () => {
    const { padrao } = saidasDoLink(
      view({ match: saida('g-nov', '2026-11-20'), alternatives: [saida('g-2', '2026-11-25')] }),
      'nov-26',
    );

    expect(padrao).toBe('g-nov');
  });
});

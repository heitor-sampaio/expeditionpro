import type { PublicEnrollmentLinkView, PublicSaida } from './usePublicEnrollmentLink.js';

/**
 * IN-25 — o que a página mostra sobre as saídas: quais, se há escolha a fazer, qual já vem
 * marcada e se o link errou a data.
 *
 * O link completo traz a data, e então não há escolha: a pessoa escolheu no site, diante do
 * calendário. Mostrar um seletor com uma opção só seria um controle que não controla nada e,
 * pior, insinuaria uma alternativa que não está ali.
 *
 * A escolha reabre em dois casos, e só neles: o link que não trouxe data (ou trouxe uma que
 * fechou), e o mês com duas saídas — em que `nov-26` é ambíguo e quem decide é quem vai viajar.
 *
 * Fora do componente porque a suíte roda em node, sem DOM: decisão que não cabe no teste não
 * cabe na tela.
 */

/**
 * A frase de cima, quando há uma. **Link sem data não errou nada**: ele é o do post genérico, o
 * do perfil, o que alguém mandou no grupo, e quem chegou por ele veio para escolher. Abrir com
 * "a data deste link não está mais aberta" acusa um erro que ninguém cometeu e planta a dúvida
 * de que a expedição acabou.
 */
export type AvisoDoLink = 'data-fechada' | 'data-ilegivel' | null;

export function saidasDoLink(
  view: PublicEnrollmentLinkView,
  /** O que veio na URL, como veio. `undefined` = o link não pediu data nenhuma. */
  saidaDoLink: string | undefined,
): {
  opcoes: PublicSaida[];
  escolhaAberta: boolean;
  /** A saída já marcada ao abrir, quando há uma óbvia. */
  padrao: string | null;
  aviso: AvisoDoLink;
} {
  const opcoes = [...(view.match === null ? [] : [view.match]), ...view.alternatives];

  return {
    opcoes,
    escolhaAberta: opcoes.length > 1,
    /*
     * Opção única vem marcada mesmo sem o link ter pedido. Sem isto o botão de enviar trava
     * para sempre no caso mais comum do link sem data: uma saída aberta, nenhum rádio para
     * clicar (porque com uma opção não há escolha) e nada selecionado.
     */
    padrao: view.match?.groupId ?? (opcoes.length === 1 ? (opcoes[0]?.groupId ?? null) : null),
    aviso: avisoDe(view, saidaDoLink),
  };
}

function avisoDe(view: PublicEnrollmentLinkView, saidaDoLink: string | undefined): AvisoDoLink {
  if (saidaDoLink === undefined || view.match !== null) return null;
  // `set-26` que fechou e `xyz-27` que não é mês nenhum são problemas diferentes, e quem está
  // olhando a tela merece saber qual dos dois aconteceu.
  return view.saidaReconhecida ? 'data-fechada' : 'data-ilegivel';
}

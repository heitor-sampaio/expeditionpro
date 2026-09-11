import type { PublicEnrollmentLinkView, PublicSaida } from './usePublicEnrollmentLink.js';

/**
 * IN-25 — as saídas que a página mostra, e se ainda há escolha a fazer.
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
export function saidasDoLink(view: PublicEnrollmentLinkView): {
  opcoes: PublicSaida[];
  escolhaAberta: boolean;
} {
  const opcoes = [...(view.match === null ? [] : [view.match]), ...view.alternatives];
  return { opcoes, escolhaAberta: opcoes.length > 1 };
}

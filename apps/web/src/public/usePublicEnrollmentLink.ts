import { useEffect, useState } from 'react';
import { publicApi, PUBLIC_TENANT_SLUG } from './publicApi.js';
import type { PublicRouteInscricao } from './publicRoute.js';

/**
 * IN-25 — o que o link trouxe, resolvido pelo servidor.
 *
 * Quem decide qual saída o mês escolheu é o servidor, não a tela: o mesmo `jan-27` tem de
 * significar a mesma coisa aqui e na hora de gravar a inscrição, e duas leituras do mesmo texto
 * são duas chances de divergirem.
 */

export interface PublicSaida {
  groupId: string;
  name: string;
  startDate: string;
  endDate: string;
  /** PC-20: `null` = saída sem limite de vagas. */
  vacancies: number | null;
}

export interface PublicEnrollmentLinkView {
  itineraryName: string;
  itinerarySlug: string;
  /** `false` quando o link trouxe uma data que não se consegue ler. */
  saidaReconhecida: boolean;
  match: PublicSaida | null;
  alternatives: PublicSaida[];
}

export type LinkState =
  | { status: 'loading' }
  | { status: 'ready'; view: PublicEnrollmentLinkView }
  /** O roteiro não existe, não é de vitrine, ou o link está velho demais. */
  | { status: 'not-found' }
  | { status: 'error' };

export function usePublicEnrollmentLink(rota: PublicRouteInscricao): LinkState {
  const [state, setState] = useState<LinkState>({ status: 'loading' });

  useEffect(() => {
    // Link sem roteiro (encurtador que comeu a query, botão do site pela metade): a recusa
    // é a mesma, e perguntá-la ao servidor só gastaria uma ida à rede para ouvir 404.
    if (rota.roteiro === null) {
      setState({ status: 'not-found' });
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ roteiro: rota.roteiro });
    if (rota.saida !== undefined) params.set('saida', rota.saida);

    publicApi(
      `/v1/public/${encodeURIComponent(PUBLIC_TENANT_SLUG)}/enrollment-link?${params.toString()}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        // 404 e 400 são a mesma coisa para quem olha: o link não leva a lugar nenhum. A
        // diferença entre "roteiro não existe" e "mês malformado" é nossa, não de quem chegou.
        if (res.status === 404 || res.status === 400) {
          setState({ status: 'not-found' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: 'ready', view: (await res.json()) as PublicEnrollmentLinkView });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });

    return () => {
      controller.abort();
    };
  }, [rota.roteiro, rota.saida]);

  return state;
}

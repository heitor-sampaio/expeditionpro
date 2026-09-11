/**
 * IN-25 — o link do site de apresentação, lido antes de qualquer outra coisa.
 *
 * Decide se quem chegou vê a página pública de inscrição ou o portão de login. Roda **antes**
 * do `useAuth`, de propósito: um estranho vindo de um anúncio não deve acordar o cliente de
 * autenticação, nem correr o risco do `signOut` que o `api.ts` dispara num 401 — ele não tem
 * sessão nenhuma para perder.
 *
 * Pura porque é a única decisão que bifurca o aplicativo: o componente que ela escolhe não tem
 * teste, e o que não tem teste precisa não ter decisão dentro.
 */

export interface PublicRouteInscricao {
  readonly kind: 'inscricao';
  readonly roteiro: string;
  /** O mês como veio (`jan-27`). Quem o entende é o domínio, no servidor. */
  readonly saida: string | undefined;
}

export type PublicRoute = PublicRouteInscricao;

const CAMINHO = '/inscricao';

export function resolvePublicRoute(pathname: string, search: string): PublicRoute | null {
  // Barra no fim vem de encurtador e de quem copia da barra do navegador.
  const caminho = pathname.replace(/\/+$/, '') || '/';
  if (caminho !== CAMINHO) return null;

  const params = new URLSearchParams(search);
  const roteiro = (params.get('roteiro') ?? '').trim();
  // Sem roteiro não há o que mostrar, e cair no login é melhor que uma página vazia pedindo
  // que a pessoa adivinhe o que fazer.
  if (roteiro === '') return null;

  const saida = (params.get('saida') ?? '').trim();
  return { kind: 'inscricao', roteiro, saida: saida === '' ? undefined : saida };
}

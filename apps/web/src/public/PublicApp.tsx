import { TopoBackground } from '../ui/TopoBackground.js';
import { PublicEnrollmentScreen } from './PublicEnrollmentScreen.js';
import { usePublicTheme } from './usePublicTheme.js';
import type { PublicRoute } from './publicRoute.js';

/**
 * IN-25 — a casca da superfície pública.
 *
 * Deliberadamente magra: sem nav, sem sidebar, sem alternador de tema e **sem autenticação**.
 * Quem chega aqui veio de um botão no site de apresentação e tem uma coisa para fazer —
 * qualquer outra coisa na tela disputa com ela.
 *
 * O fundo topográfico fica: é a marca do sistema, e esta é a primeira tela que alguém de fora
 * vê dele.
 */
export function PublicApp({ rota }: { rota: PublicRoute }): React.JSX.Element {
  usePublicTheme();

  return (
    <>
      <TopoBackground />
      <PublicEnrollmentScreen rota={rota} />
    </>
  );
}

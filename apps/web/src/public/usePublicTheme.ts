import { useEffect } from 'react';

/**
 * IN-25 — o tema da superfície pública.
 *
 * **Densidade confortável, sempre**: o design system a reserva para audiência de cliente, e
 * quem abre este link está num celular, vindo de um anúncio — alvo de toque de 44px não é
 * preferência, é o que faz o formulário ser preenchível.
 *
 * **Modo pelo sistema, e sem `localStorage`.** Um estranho não tem preferência salva aqui, e
 * ler a que existe faria a página herdar o modo escuro de quem testou o app no mesmo
 * navegador. Sem alternadores na tela também: uma ação primária por tela, e ela é "enviar a
 * inscrição".
 */
export function usePublicTheme(): void {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-density', 'comfy');

    const escuro = window.matchMedia('(prefers-color-scheme: dark)');
    const aplicar = () => {
      root.setAttribute('data-mode', escuro.matches ? 'dark' : 'light');
    };

    aplicar();
    escuro.addEventListener('change', aplicar);
    return () => {
      escuro.removeEventListener('change', aplicar);
    };
  }, []);
}

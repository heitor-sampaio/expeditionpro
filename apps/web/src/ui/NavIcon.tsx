/**
 * Ícones da navegação — SVG inline monocromático (currentColor), sem nenhum asset externo
 * (design system §4: nada de imagem no sistema). Traço de 1.75, 20px, arredondado.
 */

const PATHS: Record<string, React.JSX.Element> = {
  visao: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  inicio: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </>
  ),
  expedicoes: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.2 5.3-5.3 2.2 2.2-5.3 5.3-2.2z" />
    </>
  ),
  conta: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    </>
  ),
  agenda: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </>
  ),
  fila: (
    <>
      <path d="M4 5h16M4 12h16M4 19h16" />
      <circle cx="8" cy="5" r="0.4" fill="currentColor" />
    </>
  ),
  // Três colunas de alturas diferentes: o desenho de um quadro visto de longe.
  funil: (
    <>
      <rect x="3.5" y="4.5" width="4.5" height="15" rx="1.2" />
      <rect x="9.75" y="4.5" width="4.5" height="10.5" rx="1.2" />
      <rect x="16" y="4.5" width="4.5" height="6.5" rx="1.2" />
    </>
  ),
  clientes: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.3 2.6-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
      <path d="M16 4.5a3 3 0 0 1 0 6M17 20c0-2.3-1-4.2-2.5-5.2" />
    </>
  ),
  fornecedores: (
    <>
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v7l9 4 9-4V7" />
      <path d="M12 11v7" />
    </>
  ),
  roteiros: (
    <>
      <path d="M9 3 3.5 5v16L9 19l6 2 5.5-2V3L15 5 9 3z" />
      <path d="M9 3v16M15 5v16" />
    </>
  ),
  relatorios: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16v-4M12.5 16V8M17 16v-6" />
    </>
  ),
  comunidade: (
    <>
      <path d="M4 5.5h16v10H9l-4 3.5V15.5H4z" />
    </>
  ),
  configuracoes: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M19.8 7l-2.6 1.5M6.8 15.5l-2.6 1.5" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  conversas: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4z" />
      <path d="M8.5 8.5h7M8.5 12h4" />
    </>
  ),
  documentos: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
};

export function NavIcon({ id }: { id: string }): React.JSX.Element {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[id] ?? PATHS['visao']}
    </svg>
  );
}

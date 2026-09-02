import { useState } from 'react';
import { ClientesScreen } from './customers/ClientesScreen.js';
import { CustomerScreen } from './customers/CustomerScreen.js';
import { AgendaScreen } from './agenda/AgendaScreen.js';
import { QueueScreen } from './queue/QueueScreen.js';
import { GroupBoardScreen } from './group/GroupBoardScreen.js';
import { FornecedoresScreen } from './suppliers/FornecedoresScreen.js';
import { SupplierScreen } from './suppliers/SupplierScreen.js';
import { RoteirosScreen } from './itineraries/RoteirosScreen.js';
import { ItineraryScreen } from './itineraries/ItineraryScreen.js';
import { ConfiguracoesScreen } from './settings/ConfiguracoesScreen.js';
import { ComunidadeScreen } from './community/ComunidadeScreen.js';
import { RelatoriosScreen } from './reports/RelatoriosScreen.js';
import { DashboardScreen } from './reports/DashboardScreen.js';
import { CrmScreen } from './crm/CrmScreen.js';
import { PortalApp } from './portal/PortalApp.js';
import { LoginScreen } from './auth/LoginScreen.js';
import { useAuth } from './auth/useAuth.js';
import { resolveAudience } from './auth/resolveAudience.js';
import { signOut } from './auth/authActions.js';
import { CompanyBrand } from './settings/CompanyBrand.js';
import { TopoBackground } from './ui/TopoBackground.js';
import { NavIcon } from './ui/NavIcon.js';
import { useTheme, type ThemeControls } from './ui/useTheme.js';
import { useSidebarCollapsed } from './ui/useSidebarCollapsed.js';

/**
 * Casca do app (design system §7): sidebar com marca + navegação por seções (ícone +
 * rótulo), barra superior com trilha e os alternadores de modo/densidade. A sidebar
 * recolhe para uma trilha de ícones (menu expansível), e o conteúdo tem rolagem própria
 * — a sidebar fica fixa, sem scroll. Roteamento simples por estado; nenhuma lógica aqui.
 */

type View =
  | 'visao'
  | 'agenda'
  | 'fila'
  | 'funil'
  | 'clientes'
  | 'fornecedores'
  | 'roteiros'
  | 'relatorios'
  | 'comunidade'
  | 'configuracoes';

interface NavItem {
  readonly id: View;
  readonly label: string;
}
interface NavSection {
  readonly label: string | null;
  readonly items: readonly NavItem[];
}

const NAV: readonly NavSection[] = [
  {
    label: null,
    items: [
      { id: 'visao', label: 'Visão geral' },
      { id: 'agenda', label: 'Agenda' },
      { id: 'fila', label: 'Inscrições' },
      { id: 'funil', label: 'Funil' },
      { id: 'clientes', label: 'Clientes' },
      { id: 'fornecedores', label: 'Fornecedores' },
      { id: 'roteiros', label: 'Roteiros' },
    ],
  },
  {
    label: 'Análise',
    items: [
      { id: 'relatorios', label: 'Relatórios' },
      { id: 'comunidade', label: 'Comunidade' },
    ],
  },
  {
    label: 'Sistema',
    items: [{ id: 'configuracoes', label: 'Configurações' }],
  },
];

const TITLES: Record<View, string> = {
  visao: 'Visão geral',
  agenda: 'Agenda',
  fila: 'Inscrições',
  funil: 'Funil',
  clientes: 'Clientes',
  fornecedores: 'Fornecedores',
  roteiros: 'Roteiros',
  relatorios: 'Relatórios',
  comunidade: 'Comunidade',
  configuracoes: 'Configurações',
};

/**
 * Portão de autenticação (§3.7): sem sessão, só a tela de login existe; com sessão,
 * a casca do app. O tema (modo/densidade) é aplicado no root em qualquer estado.
 */
export function App(): React.JSX.Element {
  const theme = useTheme();
  const auth = useAuth();

  if (auth.status === 'signed-in') {
    // §3.7 / A01: a audiência decide a casca — fail-closed. O back-office nunca é o
    // padrão: só um papel de equipe reconhecido abre o Shell; o cliente vai ao portal;
    // qualquer outra coisa (sem papel, papel desconhecido) é acesso negado.
    const audience = resolveAudience(auth.role, auth.customerId);
    if (audience === 'portal' && auth.customerId) {
      return (
        <>
          <TopoBackground />
          <PortalApp customerId={auth.customerId} email={auth.email} theme={theme} />
        </>
      );
    }
    if (audience === 'backoffice') {
      return <Shell theme={theme} email={auth.email} />;
    }
    return (
      <>
        <TopoBackground />
        <NoAccessScreen email={auth.email} />
      </>
    );
  }

  return (
    <>
      <TopoBackground />
      {auth.status === 'loading' ? (
        <div className="login">
          <div className="login-card card" aria-busy>
            <div className="skel-bars">
              <div className="skel-bar" />
              <div className="skel-bar short" />
            </div>
          </div>
        </div>
      ) : (
        <LoginScreen />
      )}
    </>
  );
}

/**
 * Estado "sem permissão" (design system §4, um dos cinco estados): a sessão é válida
 * mas o papel não abre nenhuma casca — conta sem `role`, papel desconhecido, ou cliente
 * sem `customer_id`. Nunca cai no back-office; só oferece sair. Verbo primeiro no botão.
 */
function NoAccessScreen({ email }: { email: string | null }): React.JSX.Element {
  return (
    <div className="login">
      <div className="login-card card" role="alert">
        <h1 className="login-title page-title">Sem acesso</h1>
        <p className="login-sub page-meta">
          {email
            ? `A conta ${email} ainda não tem permissão neste sistema.`
            : 'Esta conta ainda não tem permissão neste sistema.'}{' '}
          Fale com a equipe da Drakkar para liberar o acesso.
        </p>
        <div className="login-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}

function Shell({
  theme,
  email,
}: {
  theme: ThemeControls;
  email: string | null;
}): React.JSX.Element {
  const { mode, density, toggleMode, toggleDensity } = theme;
  const [view, setView] = useState<View>('visao');
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [boardGroupId, setBoardGroupId] = useState<string | null>(null);
  const [fileCustomerId, setFileCustomerId] = useState<string | null>(null);
  const [fileSupplierId, setFileSupplierId] = useState<string | null>(null);
  const [openItineraryId, setOpenItineraryId] = useState<string | null>(null);

  const clearOverlays = () => {
    setBoardGroupId(null);
    setFileCustomerId(null);
    setFileSupplierId(null);
    setOpenItineraryId(null);
  };
  const openGroup = (groupId: string) => {
    clearOverlays();
    setBoardGroupId(groupId);
  };
  const openFile = (customerId: string) => {
    clearOverlays();
    setFileCustomerId(customerId);
  };
  const openSupplierFile = (supplierId: string) => {
    clearOverlays();
    setFileSupplierId(supplierId);
  };
  const openItinerary = (id: string) => {
    clearOverlays();
    setOpenItineraryId(id);
  };
  const goTo = (next: View) => {
    clearOverlays();
    setView(next);
  };

  const atRoot =
    boardGroupId === null &&
    fileCustomerId === null &&
    fileSupplierId === null &&
    openItineraryId === null;

  return (
    <>
      <TopoBackground />
      <div className="app">
        <aside className={`sidebar${collapsed ? ' is-collapsed' : ''}`}>
          <CompanyBrand />
          <nav className="nav" aria-label="navegação principal">
            {NAV.map((section, i) => (
              <div key={i} className="nav-section">
                {section.label && <div className="nav-sec">{section.label}</div>}
                {section.items.map((item) => {
                  const active = view === item.id && atRoot;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`nav-item${active ? ' is-active' : ''}`}
                      onClick={() => goTo(item.id)}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                    >
                      <NavIcon id={item.id} />
                      <span className="nav-label">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sidebar-spacer" />
          <button
            type="button"
            className="nav-item nav-collapse"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <span className="nav-icon nav-chevron" aria-hidden="true">
              {collapsed ? '›' : '‹'}
            </span>
            <span className="nav-label">Recolher menu</span>
          </button>
          <div className="userbox">
            <span className="avatar">{initialsOf(email)}</span>
            <div className="userbox-id">
              <span className="userbox-name">{email ?? 'Equipe'}</span>
              <span className="userbox-role">Sessão ativa</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm userbox-signout"
              onClick={() => void signOut()}
            >
              Sair
            </button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <nav className="crumbs" aria-label="trilha">
              <span className="crumb">ExpeditionPRO</span>
              <span className="crumb-sep">/</span>
              {boardGroupId ? (
                <>
                  <button type="button" className="crumb crumb-link" onClick={() => goTo('agenda')}>
                    Agenda
                  </button>
                  <span className="crumb-sep">/</span>
                  <span className="crumb is-current">Grupo</span>
                </>
              ) : fileCustomerId ? (
                <>
                  <button
                    type="button"
                    className="crumb crumb-link"
                    onClick={() => goTo('clientes')}
                  >
                    Clientes
                  </button>
                  <span className="crumb-sep">/</span>
                  <span className="crumb is-current">Ficha</span>
                </>
              ) : fileSupplierId ? (
                <>
                  <button
                    type="button"
                    className="crumb crumb-link"
                    onClick={() => goTo('fornecedores')}
                  >
                    Fornecedores
                  </button>
                  <span className="crumb-sep">/</span>
                  <span className="crumb is-current">Ficha</span>
                </>
              ) : openItineraryId ? (
                <>
                  <button
                    type="button"
                    className="crumb crumb-link"
                    onClick={() => goTo('roteiros')}
                  >
                    Roteiros
                  </button>
                  <span className="crumb-sep">/</span>
                  <span className="crumb is-current">Roteiro</span>
                </>
              ) : (
                <span className="crumb is-current">{TITLES[view]}</span>
              )}
            </nav>
            <div className="topbar-spacer" />
            <div className="toggles">
              <button type="button" className="btn btn-secondary btn-sm" onClick={toggleMode}>
                {mode === 'light' ? 'Modo escuro' : 'Modo claro'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={toggleDensity}>
                {density === 'compact' ? 'Densidade confortável' : 'Densidade compacta'}
              </button>
            </div>
          </header>

          <div className="main-scroll">
            {boardGroupId ? (
              <GroupBoardScreen groupId={boardGroupId} onBack={() => goTo('agenda')} />
            ) : openItineraryId ? (
              <ItineraryScreen
                itineraryId={openItineraryId}
                onBack={() => goTo('roteiros')}
                onOpenGroup={openGroup}
              />
            ) : fileCustomerId ? (
              <CustomerScreen
                customerId={fileCustomerId}
                onBack={() => goTo('clientes')}
                onOpenGroup={openGroup}
              />
            ) : fileSupplierId ? (
              <SupplierScreen
                supplierId={fileSupplierId}
                onBack={() => goTo('fornecedores')}
                onOpenGroup={openGroup}
              />
            ) : view === 'visao' ? (
              <DashboardScreen onOpenGroup={openGroup} />
            ) : view === 'agenda' ? (
              <AgendaScreen onOpenGroup={openGroup} />
            ) : view === 'fila' ? (
              <QueueScreen />
            ) : view === 'funil' ? (
              <CrmScreen />
            ) : view === 'fornecedores' ? (
              <FornecedoresScreen onOpenFile={openSupplierFile} />
            ) : view === 'roteiros' ? (
              <RoteirosScreen onOpenItinerary={openItinerary} />
            ) : view === 'configuracoes' ? (
              <ConfiguracoesScreen />
            ) : view === 'comunidade' ? (
              <ComunidadeScreen admin />
            ) : view === 'relatorios' ? (
              <RelatoriosScreen />
            ) : (
              <ClientesScreen onOpenFile={openFile} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function initialsOf(email: string | null): string {
  if (!email) return 'EQ';
  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[.\-_]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? email[0] ?? 'E';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

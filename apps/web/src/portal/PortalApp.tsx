import { useState } from 'react';
import { signOut } from '../auth/authActions.js';
import { TermGate } from './TermGate.js';
import { ComunidadeScreen } from '../community/ComunidadeScreen.js';
import { PortalExpeditionsScreen } from './PortalExpeditionsScreen.js';
import { PortalDashboardScreen } from './PortalDashboardScreen.js';
import { PortalItineraryScreen } from './PortalItineraryScreen.js';
import { PortalAgendaScreen } from './PortalAgendaScreen.js';
import { PortalContaScreen } from './PortalContaScreen.js';
import { usePortalHome, type HomeState } from './usePortalHome.js';
import { formatCents } from './format.js';
import { NavIcon } from '../ui/NavIcon.js';
import { useSidebarCollapsed } from '../ui/useSidebarCollapsed.js';
import type { ThemeControls } from '../ui/useTheme.js';

type PortalTab = 'inicio' | 'agenda' | 'expedicoes' | 'comunidade' | 'conta';

const PORTAL_NAV: readonly { id: PortalTab; label: string }[] = [
  { id: 'inicio', label: 'Início' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'expedicoes', label: 'Expedições' },
  { id: 'comunidade', label: 'Comunidade' },
  { id: 'conta', label: 'Minha conta' },
];

const TITLES: Record<PortalTab, string> = {
  inicio: 'Início',
  agenda: 'Agenda',
  expedicoes: 'Expedições',
  comunidade: 'Comunidade',
  conta: 'Minha conta',
};

/**
 * Portal do cliente (§3.7). Audiência separada da equipe, com a mesma casca do back-office
 * (sidebar + topbar): o cliente vê só a própria ficha (expedições, financeiro, cashback) e
 * edita o que PC-06/PC-08 permitem; identidade vira pedido de aprovação (PC-07). O saldo de
 * cashback fica no topo. Escrita mediada pelo servidor.
 */
export function PortalApp({
  customerId,
  email,
  theme,
}: {
  customerId: string;
  email: string | null;
  theme: ThemeControls;
}): React.JSX.Element {
  const [tab, setTab] = useState<PortalTab>('inicio');
  const [openItinerary, setOpenItinerary] = useState<string | null>(null);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const { state: home, refresh: refreshHome } = usePortalHome(customerId);

  return (
    <div className="app">
      <aside className={`sidebar${collapsed ? ' is-collapsed' : ''}`}>
        <div className="brand">
          <span className="brand-mark">DK</span>
          <div className="brand-id">
            <div className="brand-name">Drakkar Expedições</div>
            <div className="brand-sub">Portal do cliente</div>
          </div>
        </div>
        <nav className="nav" aria-label="navegação do portal">
          {PORTAL_NAV.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item${active ? ' is-active' : ''}`}
                onClick={() => {
                  setOpenItinerary(null);
                  setTab(item.id);
                }}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
              >
                <NavIcon id={item.id} />
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
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
          <span className="avatar">{initials(email ?? 'Cliente')}</span>
          <div className="userbox-id">
            <span className="userbox-name">{email ?? 'Cliente'}</span>
            <span className="userbox-role">Cliente</span>
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
            <span className="crumb">Portal</span>
            <span className="crumb-sep">/</span>
            <span className={openItinerary ? 'crumb' : 'crumb is-current'}>{TITLES[tab]}</span>
            {openItinerary && (
              <>
                <span className="crumb-sep">/</span>
                <span className="crumb is-current">Roteiro</span>
              </>
            )}
          </nav>
          <div className="topbar-spacer" />
          <CashbackBadge home={home} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={theme.toggleMode}>
            {theme.mode === 'light' ? 'Modo escuro' : 'Modo claro'}
          </button>
        </header>

        <div className="main-scroll">
          <TermGate customerId={customerId}>
            {openItinerary ? (
              <PortalItineraryScreen
                itineraryId={openItinerary}
                onBack={() => setOpenItinerary(null)}
              />
            ) : tab === 'inicio' ? (
              <PortalDashboardScreen
                home={home}
                onCheckedIn={refreshHome}
                onGoExpeditions={() => setTab('expedicoes')}
                onOpenItinerary={setOpenItinerary}
              />
            ) : tab === 'agenda' ? (
              <PortalAgendaScreen onOpenItinerary={setOpenItinerary} />
            ) : tab === 'expedicoes' ? (
              <PortalExpeditionsScreen onOpenItinerary={setOpenItinerary} />
            ) : tab === 'comunidade' ? (
              <ComunidadeScreen />
            ) : (
              <PortalContaScreen customerId={customerId} />
            )}
          </TermGate>
        </div>
      </div>
    </div>
  );
}

/** Saldo de cashback no topo (§5.8): número mono tabular, unidade colada, cor neutra. */
function CashbackBadge({ home }: { home: HomeState }): React.JSX.Element {
  return (
    <div className="cashback-badge" title="Saldo de cashback">
      <span className="cashback-label">cashback</span>
      <span className="money">
        <span className="money-unit">R$</span>
        <span className="cashback-value">
          {home.status === 'ready' ? formatCents(home.data.balanceCents) : '—'}
        </span>
      </span>
    </div>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

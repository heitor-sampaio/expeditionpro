import { useState } from 'react';
import { UsuariosScreen } from './UsuariosScreen.js';
import { EmpresaScreen } from './EmpresaScreen.js';
import { EquipeScreen } from './EquipeScreen.js';
import { IntegracoesScreen } from '../integrations/IntegracoesScreen.js';
import { PromocoesScreen } from './PromocoesScreen.js';
import { DocumentosScreen } from '../documents/DocumentosScreen.js';
import { AprovacoesScreen } from '../approvals/AprovacoesScreen.js';

/**
 * Configurações do tenant (design system §7): abas + telas em cartão. Reúne num lugar só
 * o que eram entradas soltas de menu — Usuários, Integrações, Promoções, Documentos e
 * Alteração de dados. Cada aba é uma tela própria, sem lógica de negócio aqui.
 */

type Tab =
  'empresa' | 'equipe' | 'usuarios' | 'integracoes' | 'promocoes' | 'documentos' | 'alteracao';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'empresa', label: 'Empresa' },
  { id: 'equipe', label: 'Equipe' },
  { id: 'usuarios', label: 'Usuários' },
  { id: 'integracoes', label: 'Integrações' },
  { id: 'promocoes', label: 'Promoções' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'alteracao', label: 'Alteração de dados' },
];

export function ConfiguracoesScreen(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('empresa');

  return (
    <div className="config">
      <div className="config-tabbar">
        <div className="tabs" role="tablist" aria-label="configurações">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'empresa' ? (
        <EmpresaScreen />
      ) : tab === 'equipe' ? (
        <EquipeScreen />
      ) : tab === 'usuarios' ? (
        <UsuariosScreen />
      ) : tab === 'integracoes' ? (
        <IntegracoesScreen />
      ) : tab === 'promocoes' ? (
        <PromocoesScreen />
      ) : tab === 'documentos' ? (
        <DocumentosScreen />
      ) : (
        <AprovacoesScreen />
      )}
    </div>
  );
}

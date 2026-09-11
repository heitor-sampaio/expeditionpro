import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { PublicApp } from './public/PublicApp.js';
import { resolvePublicRoute } from './public/publicRoute.js';
import './styles/tokens.css';
import './styles/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('elemento #root ausente no index.html');

/**
 * IN-25 — a bifurcação acontece **aqui**, e não dentro do `App`.
 *
 * O `App` chama `useAuth()` incondicionalmente, e isso acorda o cliente do Supabase. Quem chega
 * pelo link do site de apresentação é um estranho: não tem sessão para consultar, não tem token
 * para renovar, e não pode ser alcançado pelo `signOut` que o `api.ts` dispara num 401.
 * Decidindo antes de montar a árvore, a superfície pública nunca toca na autenticada.
 */
const rota = resolvePublicRoute(window.location.pathname, window.location.search);

createRoot(container).render(
  <StrictMode>{rota === null ? <App /> : <PublicApp rota={rota} />}</StrictMode>,
);

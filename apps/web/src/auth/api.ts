import { API_BASE, apiUrl } from './apiUrl.js';
import { supabase } from './supabaseClient.js';

/**
 * Wrapper de todas as chamadas à API. Injeta `Authorization: Bearer <access_token>`
 * a partir da sessão atual do Supabase — nenhuma tela monta o header à mão. Assim a
 * autenticação vive num lugar só: trocar de provedor mexe aqui, não nos hooks.
 *
 * Em `401` (token expirado, revogado ou recusado), tenta **renovar a sessão uma vez** e
 * repetir; se ainda falhar, faz `signOut` — o portão de auth reage e volta ao login.
 * `403` NÃO desloga: é falta de permissão (papel), não de sessão.
 */

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Renovação single-flight: 401 concorrentes compartilham a mesma tentativa. */
let refreshing: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  refreshing ??= supabase.auth
    .refreshSession()
    .then(({ data }) => data.session?.access_token ?? null)
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function withAuth(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(apiUrl(API_BASE, path), withAuth(init, token));
  if (res.status !== 401) return res;

  const fresh = await refreshAccessToken();
  if (fresh) {
    const retry = await fetch(apiUrl(API_BASE, path), withAuth(init, fresh));
    if (retry.status !== 401) return retry;
  }
  // sessão irrecuperável: desloga; o `onAuthStateChange` leva ao login
  await supabase.auth.signOut();
  return res;
}

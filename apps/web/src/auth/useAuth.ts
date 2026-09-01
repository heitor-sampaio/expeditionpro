import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';
import type { Session } from '@supabase/supabase-js';

/**
 * Estado de autenticação da sessão atual. Assina `onAuthStateChange` para reagir a
 * login, logout, renovação de token e ao retorno do magic link. Expõe o papel e o
 * `customerId` do `app_metadata` — é o que separa a audiência equipe da cliente (§3.7):
 * o app roteia para o back-office ou para o portal a partir daqui.
 */

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | {
      status: 'signed-in';
      email: string | null;
      role: string | null;
      customerId: string | null;
    };

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setState(toState(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(toState(session));
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}

function toState(session: Session | null): AuthState {
  if (!session) return { status: 'signed-out' };
  const meta = (session.user.app_metadata ?? {}) as { role?: string; customer_id?: string };
  return {
    status: 'signed-in',
    email: session.user.email ?? null,
    role: meta.role ?? null,
    customerId: meta.customer_id ?? null,
  };
}

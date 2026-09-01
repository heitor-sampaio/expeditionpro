import { supabase } from './supabaseClient.js';

/**
 * Ações de autenticação (§3.7). Login por senha e por magic link (os dois na mesma
 * tela) e logout. Erros viram mensagem amigável — nunca vazam a mensagem crua do
 * provedor, que às vezes confirma se o e-mail existe.
 */

export type AuthResult = { ok: true } | { ok: false; message: string };

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: 'E-mail ou senha incorretos.' };
  return { ok: true };
}

export async function signInWithMagicLink(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) return { ok: false, message: 'Não deu para enviar o link. Confira o e-mail.' };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

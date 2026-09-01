import { createClient } from '@supabase/supabase-js';

/**
 * Cliente do Supabase Auth no navegador. Usa a URL e a **chave publicável** do projeto
 * (não é segredo). A sessão persiste e o token renova sozinho; `detectSessionInUrl`
 * captura o retorno do magic link. O token vai no header `Authorization: Bearer` de
 * toda chamada à API (ver `api.ts`); o servidor o verifica (§3.7).
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const authConfigured = Boolean(url && key);

export const supabase = createClient(url ?? '', key ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

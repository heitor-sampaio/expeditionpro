/**
 * §3.7 / A01 (Broken Access Control) — a audiência decide a casca do app a partir do
 * papel no `app_metadata`. **Fail-closed:** o back-office nunca é o padrão. Só um papel
 * de equipe reconhecido abre o `Shell`; o cliente vai para o portal; qualquer outra
 * coisa (sem papel, papel desconhecido, cliente sem `customer_id`) é acesso negado.
 * Função pura para ser testável — o componente só renderiza o que ela decidir.
 */

export type Audience = 'portal' | 'backoffice' | 'denied';

export const TEAM_ROLES = ['owner', 'admin', 'operator', 'viewer'] as const;

export function resolveAudience(role: string | null, customerId: string | null): Audience {
  if (role === 'customer') return customerId ? 'portal' : 'denied';
  if (role !== null && (TEAM_ROLES as readonly string[]).includes(role)) return 'backoffice';
  return 'denied';
}

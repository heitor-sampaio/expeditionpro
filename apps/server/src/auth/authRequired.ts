/**
 * SEC-01 — como a autenticação é resolvida, e por que ela é obrigatória.
 *
 * Esta decisão vivia inline no `main.ts` e falhava **aberta**: sem nenhuma das três
 * variáveis, o servidor avisava no console e passava a aceitar qualquer requisição anônima
 * como `team`/`owner`, com o tenant vindo de um header do próprio chamador. Extraída para
 * cá, a regra vira função pura e testável, e passa a recusar em vez de degradar.
 *
 * O padrão já existia no mesmo arquivo: `unavailableCipher` recusa operar quando falta a
 * chave de cifra, em vez de guardar o segredo em claro. É a mesma disciplina.
 */

export type AuthConfig =
  | { readonly kind: 'jwks'; readonly url: string; readonly issuer?: string }
  | { readonly kind: 'secret'; readonly secret: string; readonly issuer?: string }
  | { readonly kind: 'insecure-dev-stub' };

export class MissingAuthConfigError extends Error {
  constructor() {
    super(
      'Autenticação não configurada. Defina SUPABASE_URL (o servidor deriva a JWKS), ' +
        'ou SUPABASE_JWKS_URL, ou SUPABASE_JWT_SECRET. ' +
        'Sem uma delas o servidor aceitaria qualquer requisição como owner — por isso recusa subir.',
    );
    this.name = 'MissingAuthConfigError';
  }
}

/** A JWKS do projeto, derivada da URL — o caminho mais simples de configurar. */
function jwksFromUrl(url: string): string {
  return `${url.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`;
}

/**
 * Precedência: JWKS explícita → segredo HS256 legado → JWKS derivada da `SUPABASE_URL`.
 *
 * Fora de desenvolvimento e de teste, ausência das três **lança**. O stub inseguro continua
 * disponível localmente, que é o caso de uso legítimo dele: tocar o backend antes de plugar
 * o Auth. O erro nunca foi ele existir — foi ele valer em produção.
 */
export function authConfigFrom(
  env: Record<string, string | undefined>,
  nodeEnv: string | undefined,
): AuthConfig {
  /*
   * SEC-01: o emissor esperado é `<SUPABASE_URL>/auth/v1`. Só dá para exigi-lo quando a
   * URL do projeto é conhecida — quem configura só a JWKS explícita ou o segredo legado
   * segue sem, que é o comportamento de antes e não piora nada.
   */
  const supabaseUrl = env['SUPABASE_URL'];
  const issuer = supabaseUrl ? `${supabaseUrl.replace(/\/+$/, '')}/auth/v1` : undefined;

  const explicitJwks = env['SUPABASE_JWKS_URL'];
  if (explicitJwks) return { kind: 'jwks', url: explicitJwks, ...(issuer ? { issuer } : {}) };

  const secret = env['SUPABASE_JWT_SECRET'];
  if (secret) return { kind: 'secret', secret, ...(issuer ? { issuer } : {}) };

  if (supabaseUrl) return { kind: 'jwks', url: jwksFromUrl(supabaseUrl), issuer: issuer! };

  if (nodeEnv === 'development' || nodeEnv === 'test') return { kind: 'insecure-dev-stub' };
  throw new MissingAuthConfigError();
}

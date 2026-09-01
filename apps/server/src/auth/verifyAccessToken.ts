import { jwtVerify } from 'jose';
import { UnauthorizedError } from '@expedition/application';
import type { Actor, RequestContext, TeamRole } from '@expedition/application';

/**
 * SEC/§3.7 — verifica o access token do Supabase Auth e mapeia `app_metadata` →
 * `RequestContext`. Suporta as duas famílias de chave do Supabase: o **JWT secret**
 * legado (HS256, simétrico) e as **signing keys** novas (assimétricas, via JWKS —
 * a `key` é o resolvedor do `createRemoteJWKSet`). Os `algorithms` são fixados por modo
 * para não abrir confusão de algoritmo. **Sempre `app_metadata`, nunca `user_metadata`**
 * (este é editável pelo usuário — colocar tenant/role lá é escalação de privilégio).
 * Qualquer falha (assinatura, expiração, claim ausente, papel desconhecido) vira 401.
 */

const TEAM_ROLES: readonly TeamRole[] = ['owner', 'admin', 'operator', 'viewer'];

/** Chave aceita pelo `jwtVerify`: segredo simétrico OU resolvedor de JWKS. */
export type JwtKey = Parameters<typeof jwtVerify>[1];

interface AppMetadata {
  readonly tenant_id?: unknown;
  readonly role?: unknown;
  readonly customer_id?: unknown;
}

export async function verifyAccessToken(
  token: string,
  key: JwtKey,
  algorithms: readonly string[] = ['HS256'],
  /**
   * SEC-01 — emissor esperado (`<SUPABASE_URL>/auth/v1`). Sem ele, `jwtVerify` aceita
   * qualquer token que a chave valide: um segredo HS256 reaproveitado noutro serviço, ou
   * uma JWKS de emissor compartilhado, deixariam entrar token legítimo de outro sistema
   * que trouxesse `app_metadata.tenant_id`. Opcional para não quebrar quem já roda sem.
   */
  issuer?: string,
): Promise<RequestContext> {
  let claims: { sub?: unknown; app_metadata?: unknown };
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: [...algorithms],
      ...(issuer ? { issuer } : {}),
    });
    claims = payload;
  } catch {
    throw new UnauthorizedError('Token inválido');
  }

  const sub = typeof claims.sub === 'string' ? claims.sub : '';
  const meta = (claims.app_metadata ?? {}) as AppMetadata;
  const tenantId = typeof meta.tenant_id === 'string' ? meta.tenant_id : '';
  if (sub === '' || tenantId === '') {
    throw new UnauthorizedError('Claims obrigatórias ausentes');
  }

  return { tenantId, actor: toActor(sub, meta) };
}

function toActor(userId: string, meta: AppMetadata): Actor {
  const role = meta.role;
  if (typeof role === 'string' && (TEAM_ROLES as readonly string[]).includes(role)) {
    return { kind: 'team', userId, role: role as TeamRole };
  }
  if (role === 'customer') {
    const customerId = typeof meta.customer_id === 'string' ? meta.customer_id : '';
    if (customerId === '') {
      throw new UnauthorizedError('Cliente sem customer_id');
    }
    return { kind: 'customer', userId, customerId };
  }
  throw new UnauthorizedError('Papel desconhecido');
}

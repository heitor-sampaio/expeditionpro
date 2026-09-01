import { createRemoteJWKSet } from 'jose';
import { UnauthorizedError } from '@expedition/application';
import { verifyAccessToken, type JwtKey } from './verifyAccessToken.js';
import type { RequestContext } from '@expedition/application';
import type { FastifyRequest } from 'fastify';

/**
 * Assento da autenticação real (§3.7): lê `Authorization: Bearer <jwt>` e resolve o
 * `RequestContext` a partir do token do Supabase Auth. Sem token válido → 401. Trocar
 * de provedor — ou de família de chave (segredo HS256 → signing keys JWKS) — mexe só aqui.
 */

function makeResolveContext(
  key: JwtKey,
  algorithms: readonly string[],
  issuer?: string,
): (request: FastifyRequest) => Promise<RequestContext> {
  return async (request: FastifyRequest): Promise<RequestContext> => {
    const header = request.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization Bearer ausente');
    }
    return verifyAccessToken(header.slice('Bearer '.length).trim(), key, algorithms, issuer);
  };
}

/** Chave simétrica legada (HS256, `SUPABASE_JWT_SECRET`). */
export function makeJwtResolveContext(
  jwtSecret: string,
  issuer?: string,
): (request: FastifyRequest) => Promise<RequestContext> {
  return makeResolveContext(new TextEncoder().encode(jwtSecret), ['HS256'], issuer);
}

/**
 * Signing keys assimétricas do Supabase (JWKS). O `createRemoteJWKSet` busca e cacheia
 * as chaves públicas e escolhe a certa pelo `kid`; algoritmos assimétricos só — sem
 * HS256 na mesma via, para não abrir confusão de algoritmo.
 */
export function makeJwksResolveContext(
  jwksUrl: string,
  issuer?: string,
): (request: FastifyRequest) => Promise<RequestContext> {
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  return makeResolveContext(jwks, ['ES256', 'RS256'], issuer);
}

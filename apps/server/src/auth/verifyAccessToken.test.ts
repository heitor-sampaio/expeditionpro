import { describe, expect, it } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import { UnauthorizedError } from '@expedition/application';
import { verifyAccessToken } from './verifyAccessToken.js';

const SECRET = new TextEncoder().encode('super-secret-jwt-key-for-tests-1234567890');

async function mint(
  claims: Record<string, unknown>,
  opts: { exp?: string; secret?: Uint8Array } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(opts.secret ?? SECRET);
}

describe('SEC: verifyAccessToken — JWT do Supabase → RequestContext', () => {
  it('mapeia equipe: app_metadata.role + tenant_id → actor team', async () => {
    const token = await mint({
      sub: 'user-1',
      app_metadata: { tenant_id: 'tenant-a', role: 'admin' },
    });
    const ctx = await verifyAccessToken(token, SECRET);
    expect(ctx.tenantId).toBe('tenant-a');
    expect(ctx.actor).toEqual({ kind: 'team', userId: 'user-1', role: 'admin' });
  });

  it('mapeia cliente: role customer + customer_id → actor customer', async () => {
    const token = await mint({
      sub: 'user-2',
      app_metadata: { tenant_id: 'tenant-a', role: 'customer', customer_id: 'cust-9' },
    });
    const ctx = await verifyAccessToken(token, SECRET);
    expect(ctx.actor).toEqual({ kind: 'customer', userId: 'user-2', customerId: 'cust-9' });
  });

  it('assinatura inválida (outra chave) → 401', async () => {
    const other = new TextEncoder().encode('chave-completamente-diferente-000000000000');
    const token = await mint(
      { sub: 'u', app_metadata: { tenant_id: 't', role: 'admin' } },
      { secret: other },
    );
    await expect(verifyAccessToken(token, SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('token expirado → 401', async () => {
    const token = await mint(
      { sub: 'u', app_metadata: { tenant_id: 't', role: 'admin' } },
      { exp: '-1h' },
    );
    await expect(verifyAccessToken(token, SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('sem tenant_id → 401', async () => {
    const token = await mint({ sub: 'u', app_metadata: { role: 'admin' } });
    await expect(verifyAccessToken(token, SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('role desconhecido → 401', async () => {
    const token = await mint({ sub: 'u', app_metadata: { tenant_id: 't', role: 'superuser' } });
    await expect(verifyAccessToken(token, SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('cliente sem customer_id → 401', async () => {
    const token = await mint({ sub: 'u', app_metadata: { tenant_id: 't', role: 'customer' } });
    await expect(verifyAccessToken(token, SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('lixo (não é JWT) → 401', async () => {
    await expect(verifyAccessToken('não-é-um-token', SECRET)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('JWKS/§3.7: verifica token assimétrico (ES256, signing key) com a chave pública', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const token = await new SignJWT({
      sub: 'user-a',
      app_metadata: { tenant_id: 'tenant-a', role: 'customer', customer_id: 'cust-1' },
    })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const ctx = await verifyAccessToken(token, publicKey, ['ES256', 'RS256']);
    expect(ctx.actor).toEqual({ kind: 'customer', userId: 'user-a', customerId: 'cust-1' });
  });

  it('confusão de algoritmo: token HS256 é recusado quando só ES256/RS256 valem', async () => {
    const token = await mint({ sub: 'u', app_metadata: { tenant_id: 't', role: 'admin' } });
    const { publicKey } = await generateKeyPair('ES256');
    await expect(verifyAccessToken(token, publicKey, ['ES256', 'RS256'])).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('confusão de algoritmo: token ES256 é recusado quando só HS256 vale (via legada)', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const token = await new SignJWT({ sub: 'u', app_metadata: { tenant_id: 't', role: 'admin' } })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    await expect(verifyAccessToken(token, SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

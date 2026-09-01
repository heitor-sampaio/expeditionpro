import { describe, expect, it } from 'vitest';
import { fakeApiKeyRepository } from './intakeRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { createApiKey, listApiKeys, revokeApiKey } from './manageApiKeys.js';
import { BusinessRuleError, ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';

function ctxWith(role: 'owner' | 'admin' | 'operator' | 'viewer'): RequestContext {
  return { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u1', role } };
}
const owner = ctxWith('owner');
const audit = fakeAuditLogRepository();

describe('IN-21: gestão de API keys', () => {
  it('cria a chave e devolve o token completo uma vez, com o record mascarado', async () => {
    const apiKeys = fakeApiKeyRepository([]);
    const result = await createApiKey({ apiKeys, audit }, owner, { name: 'Webhook do site' });
    expect(result.token).toContain('epk_live_');
    expect(result.record.name).toBe('Webhook do site');
    expect(result.record.scopes).toContain('intake:write');
    expect(apiKeys.created).toHaveLength(1);
  });

  it('nome obrigatório', async () => {
    const apiKeys = fakeApiKeyRepository([]);
    await expect(createApiKey({ apiKeys, audit }, owner, { name: '  ' })).rejects.toBeInstanceOf(
      RequiredFieldError,
    );
  });

  it('escopo desconhecido é recusado', async () => {
    const apiKeys = fakeApiKeyRepository([]);
    await expect(
      createApiKey({ apiKeys, audit }, owner, { name: 'X', scopes: ['admin:all'] }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('operator não gere chaves (403)', async () => {
    const apiKeys = fakeApiKeyRepository([]);
    await expect(
      createApiKey({ apiKeys, audit }, ctxWith('operator'), { name: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lista as chaves (sem token/hash)', async () => {
    const apiKeys = fakeApiKeyRepository([]);
    await createApiKey({ apiKeys, audit }, owner, { name: 'A' });
    const list = await listApiKeys({ apiKeys }, owner);
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('token');
    expect(list[0]!.prefix).toContain('epk_');
  });

  it('revoga uma chave existente', async () => {
    const apiKeys = fakeApiKeyRepository([]);
    const created = await createApiKey({ apiKeys, audit }, owner, { name: 'A' });
    await revokeApiKey({ apiKeys, audit }, owner, { keyId: created.record.id });
    const list = await listApiKeys({ apiKeys }, owner);
    expect(list[0]!.revokedAt).not.toBeNull();
  });

  it('revogar chave inexistente responde NotFound', async () => {
    const apiKeys = fakeApiKeyRepository([]);
    await expect(
      revokeApiKey({ apiKeys, audit }, owner, { keyId: 'fantasma' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('§3.9 · IN-21: gestão de API key é auditada', () => {
  it('criar chave grava api_key.create com nome e escopos (sem token)', async () => {
    const apiKeys = fakeApiKeyRepository([]);
    const trail = fakeAuditLogRepository();
    const created = await createApiKey({ apiKeys, audit: trail }, owner, {
      name: 'Webhook',
      scopes: ['intake:write'],
    });
    const rows = await trail.listByEntity('tenant-a', 'api_key', created.record.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'api_key.create',
      actorUserId: 'u1',
      diff: { name: 'Webhook', scopes: ['intake:write'], environment: 'live' },
    });
    expect(JSON.stringify(rows[0])).not.toContain(created.token);
  });

  it('revogar chave grava api_key.revoke', async () => {
    const apiKeys = fakeApiKeyRepository([]);
    const trail = fakeAuditLogRepository();
    const created = await createApiKey({ apiKeys, audit: trail }, owner, { name: 'A' });
    await revokeApiKey({ apiKeys, audit: trail }, owner, { keyId: created.record.id });
    const rows = await trail.listByEntity('tenant-a', 'api_key', created.record.id);
    expect(rows.map((r) => r.action)).toEqual(['api_key.revoke', 'api_key.create']);
  });
});

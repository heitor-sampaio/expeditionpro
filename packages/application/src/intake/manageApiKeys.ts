import { BusinessRuleError, ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import { actorUserId as auditActorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { ApiKeyRecord, ApiKeyRepository, CreatedApiKey } from './intakeRepository.js';

/**
 * IN-21 — gestão de API keys (Configurações → Integrações). Criar (o valor completo
 * aparece uma única vez), listar mascarado, revogar. Operação sensível: só owner/admin.
 * Criação e revogação entram em `audit_logs` (§3.9) — nunca o token, só o record.
 */

export interface ManageApiKeysDeps {
  readonly apiKeys: ApiKeyRepository;
  readonly audit: AuditLogRepository;
}

const ALLOWED_SCOPES = new Set(['intake:write']);

export interface CreateApiKeyCommand {
  readonly name: string;
  readonly scopes?: readonly string[] | undefined;
  readonly environment?: 'live' | 'test' | undefined;
}

export async function createApiKey(
  deps: ManageApiKeysDeps,
  ctx: RequestContext,
  command: CreateApiKeyCommand,
): Promise<CreatedApiKey> {
  requireManager(ctx);
  const name = command.name.trim();
  if (name.length === 0) {
    throw new RequiredFieldError('nome');
  }
  const scopes = command.scopes && command.scopes.length > 0 ? command.scopes : ['intake:write'];
  if (scopes.some((scope) => !ALLOWED_SCOPES.has(scope))) {
    throw new BusinessRuleError('invalid_scope', 'Escopo não reconhecido');
  }
  const environment = command.environment ?? 'live';
  const created = await deps.apiKeys.create({
    tenantId: ctx.tenantId,
    name,
    scopes,
    environment,
  });
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: auditActorUserId(ctx.actor),
    entity: 'api_key',
    entityId: created.record.id,
    action: 'api_key.create',
    // Nunca o token nem o hash — só o que a investigação precisa.
    diff: { name, scopes: [...scopes], environment },
  });
  return created;
}

export async function listApiKeys(
  deps: { readonly apiKeys: ApiKeyRepository },
  ctx: RequestContext,
): Promise<ApiKeyRecord[]> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('Listar chaves é da equipe');
  }
  return deps.apiKeys.list(ctx.tenantId);
}

export interface RevokeApiKeyCommand {
  readonly keyId: string;
}

export async function revokeApiKey(
  deps: ManageApiKeysDeps,
  ctx: RequestContext,
  command: RevokeApiKeyCommand,
): Promise<void> {
  requireManager(ctx);
  const revoked = await deps.apiKeys.revoke(ctx.tenantId, command.keyId, actorUserId(ctx));
  if (!revoked) {
    throw new NotFoundError('chave');
  }
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: auditActorUserId(ctx.actor),
    entity: 'api_key',
    entityId: command.keyId,
    action: 'api_key.revoke',
    diff: {},
  });
}

function requireManager(ctx: RequestContext): void {
  const actor = ctx.actor;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Gerir API keys exige owner ou admin');
  }
}

function actorUserId(ctx: RequestContext): string {
  return ctx.actor.kind === 'team' ? ctx.actor.userId : '';
}

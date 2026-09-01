import { parseCnpj, parseCompanyLogo } from '@expedition/domain';
import { ForbiddenError, RequiredFieldError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { CompanyInfo, CompanyPatch, TenantRepository } from './tenantRepository.js';

/**
 * CF-01 — edita a identidade da empresa: razão social, CNPJ e logo.
 *
 * É o que sai no cabeçalho da roomlist (GR-15), no snapshot do Termo (DOC-08) e na marca
 * da navegação — mexer aqui muda o que o cliente e o hotel veem, então exige owner ou
 * admin. Campo ausente preserva o valor: salvar o nome não pode apagar a logo.
 */

export interface UpdateCompanyDeps {
  readonly tenants: TenantRepository;
  readonly audit: AuditLogRepository;
}

export interface UpdateCompanyCommand {
  readonly name?: string | undefined;
  readonly cnpj?: string | null | undefined;
  readonly logo?: string | null | undefined;
}

export async function updateCompany(
  deps: UpdateCompanyDeps,
  ctx: RequestContext,
  command: UpdateCompanyCommand,
): Promise<CompanyInfo> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Editar a empresa exige owner ou admin');
  }

  const current = await deps.tenants.getCompanyInfo(ctx.tenantId);
  const patch = toPatch(command);
  const changed = changedFields(current, patch);
  if (changed.length === 0) return current;

  const saved = await deps.tenants.saveCompany(ctx.tenantId, patch);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'tenant',
    entityId: ctx.tenantId,
    action: 'company.update',
    // Só os campos: a logo tem dezenas de milhares de caracteres e não é dado de
    // investigação — a trilha registra que mudou, não o quê (§3.2.1).
    diff: { fields: changed },
  });

  return saved;
}

/** Valida na entrada: depois daqui o tipo é verdade (parse, don't validate). */
function toPatch(command: UpdateCompanyCommand): CompanyPatch {
  const patch: {
    name?: string;
    cnpj?: string | null;
    logo?: string | null;
  } = {};

  if (command.name !== undefined) {
    const name = command.name.trim();
    if (name === '') throw new RequiredFieldError('razão social');
    patch.name = name;
  }
  if (command.cnpj !== undefined) {
    const digits = command.cnpj?.trim() ?? '';
    patch.cnpj = digits === '' ? null : parseCnpj(digits);
  }
  if (command.logo !== undefined) {
    patch.logo = command.logo === null ? null : parseCompanyLogo(command.logo);
  }

  return patch;
}

function changedFields(current: CompanyInfo, patch: CompanyPatch): string[] {
  const fields: string[] = [];
  if (patch.name !== undefined && patch.name !== current.name) fields.push('name');
  if (patch.cnpj !== undefined && patch.cnpj !== current.cnpj) fields.push('cnpj');
  if (patch.logo !== undefined && patch.logo !== current.logo) fields.push('logo');
  return fields;
}

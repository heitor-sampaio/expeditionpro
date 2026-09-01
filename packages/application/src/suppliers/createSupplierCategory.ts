import { requireWriter } from '../audience.js';
import { RequiredFieldError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { SupplierCategoryRecord, SupplierRepository } from './supplierRepository.js';

/**
 * FO-04 — cria uma categoria de fornecedor (dimensão do relatório de gastos por categoria).
 *
 * Idempotente por nome no tenant: se já existir, devolve a existente. É o que permite o
 * "+ Nova categoria…" inline no cadastro de fornecedor sem duplicar — e por isso o caminho
 * de já-existe **não** audita: nada mudou.
 *
 * Exige **equipe**, e não owner/admin (SEC-01): quem cadastra fornecedor é operator, e o
 * "+ Nova categoria…" é parte desse mesmo gesto — pedir owner para o rótulo e aceitar
 * operator para o fornecedor que o carrega seria rigor no lugar errado. Criar um rótulo
 * não reescreve nada; **renomear e excluir**, que mexem no passado do relatório, é que
 * pedem owner ou admin (FO-05).
 */

/** Leitura de catálogo: só o repositório. */
export interface SupplierCategoryDeps {
  readonly suppliers: SupplierRepository;
}

/** Escrita de catálogo: leva a trilha junto — quem mexe no rótulo mexe no relatório. */
export interface WriteSupplierCategoryDeps extends SupplierCategoryDeps {
  readonly audit: AuditLogRepository;
}

export interface CreateSupplierCategoryCommand {
  readonly name: string;
}

export async function createSupplierCategory(
  deps: WriteSupplierCategoryDeps,
  ctx: RequestContext,
  command: CreateSupplierCategoryCommand,
): Promise<SupplierCategoryRecord> {
  requireWriter(ctx);

  const name = command.name.trim();
  if (name.length === 0) throw new RequiredFieldError('nome da categoria');

  const existing = await deps.suppliers.findCategoryByName(ctx.tenantId, name);
  if (existing) return existing;

  const created = await deps.suppliers.createCategory({ tenantId: ctx.tenantId, name });

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'supplier_category',
    entityId: created.id,
    action: 'supplier_category.create',
    diff: { name },
  });

  return created;
}

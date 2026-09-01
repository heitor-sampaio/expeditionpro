import { requireWriter } from '../audience.js';
import { parsePixKey } from '@expedition/domain';
import { BusinessRuleError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';
import {
  blankToNull,
  resolveCategory,
  validateDoc,
  type CreateSupplierDeps,
} from './createSupplier.js';
import type { SupplierRecord } from './supplierRepository.js';

/**
 * FO-04 — edita um fornecedor. Campo ausente (`undefined`) preserva o valor atual; documento
 * informado é revalidado (dígito verificador) e a unicidade por tenant exclui o próprio
 * fornecedor. Categoria informada precisa existir no tenant; `null` limpa.
 */

export interface UpdateSupplierCommand {
  readonly id: string;
  readonly name?: string | undefined;
  readonly doc?: string | null | undefined;
  readonly docType?: 'cpf' | 'cnpj' | undefined;
  /** Ausente preserva; `null` limpa. */
  readonly pixKey?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly email?: string | null | undefined;
  readonly notes?: string | null | undefined;
  readonly categoryId?: string | null | undefined;
}

export async function updateSupplier(
  deps: CreateSupplierDeps,
  ctx: RequestContext,
  command: UpdateSupplierCommand,
): Promise<SupplierRecord> {
  requireWriter(ctx);

  const current = await deps.suppliers.findSupplierById(ctx.tenantId, command.id);
  if (!current) throw new NotFoundError('fornecedor');

  const name = command.name !== undefined ? command.name.trim() : current.name;
  if (name.length === 0) throw new RequiredFieldError('nome');

  let doc = current.doc;
  let docType = current.docType;
  if (command.doc !== undefined) {
    const digits = command.doc ? command.doc.replace(/\D/g, '') : null;
    if (digits) {
      docType = validateDoc(digits, command.docType);
      const existing = await deps.suppliers.findSupplierByDoc(ctx.tenantId, digits);
      if (existing && existing.id !== current.id) {
        throw new BusinessRuleError(
          'duplicate_supplier',
          'Já existe fornecedor com esse documento',
        );
      }
      doc = digits;
    } else {
      doc = null;
      docType = null;
    }
  }

  const categoryId =
    command.categoryId === undefined
      ? current.categoryId
      : await resolveCategory(deps, ctx, command.categoryId);

  const pix =
    command.pixKey === undefined
      ? { pixKey: current.pixKey, pixKeyType: current.pixKeyType }
      : resolvePix(command.pixKey);

  return deps.suppliers.updateSupplier(ctx.tenantId, current.id, {
    name,
    doc,
    docType,
    pixKey: pix.pixKey,
    pixKeyType: pix.pixKeyType,
    phone: command.phone !== undefined ? blankToNull(command.phone) : current.phone,
    email: command.email !== undefined ? blankToNull(command.email) : current.email,
    notes: command.notes !== undefined ? blankToNull(command.notes) : current.notes,
    categoryId,
  });
}

/**
 * FO-07 — a chave PIX vira `{ pixKey, pixKeyType }`. O tipo é **descoberto** pelo domínio,
 * não informado: o fornecedor manda a chave e a equipe cola. Chave em branco limpa os dois
 * campos juntos — tipo sem chave seria estado impossível guardado no banco.
 */
function resolvePix(raw: string | null | undefined): {
  pixKey: string | null;
  pixKeyType: string | null;
} {
  const trimmed = raw?.trim();
  if (!trimmed) return { pixKey: null, pixKeyType: null };
  const key = parsePixKey(trimmed);
  return { pixKey: key.value, pixKeyType: key.type };
}

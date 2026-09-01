import { requireWriter } from '../audience.js';
import { parseCnpj, parseCpf, parsePixKey } from '@expedition/domain';
import { BusinessRuleError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { SupplierRecord, SupplierRepository } from './supplierRepository.js';

/**
 * FO-01/GR-08 — cadastra um fornecedor (também usado na criação inline pela tabela de
 * gastos). Nome obrigatório; documento opcional, guardado só com dígitos e único por
 * tenant. O documento passa pelo **dígito verificador** (CPF ou CNPJ, FO-01/FO-03) — o
 * tipo vem do comando ou é inferido pelo tamanho (11 = CPF, 14 = CNPJ).
 */

export interface CreateSupplierDeps {
  readonly suppliers: SupplierRepository;
}

export interface CreateSupplierCommand {
  readonly name: string;
  readonly doc?: string | undefined;
  readonly docType?: 'cpf' | 'cnpj' | undefined;
  /** FO-07: chave PIX crua; o tipo sai dela. */
  readonly pixKey?: string | null | undefined;
  readonly phone?: string | undefined;
  readonly email?: string | undefined;
  readonly notes?: string | undefined;
  readonly categoryId?: string | undefined;
}

export async function createSupplier(
  deps: CreateSupplierDeps,
  ctx: RequestContext,
  command: CreateSupplierCommand,
): Promise<SupplierRecord> {
  requireWriter(ctx);

  const name = command.name.trim();
  if (name.length === 0) {
    throw new RequiredFieldError('nome');
  }

  const digits = command.doc ? command.doc.replace(/\D/g, '') : null;
  const docType = digits ? validateDoc(digits, command.docType) : null;
  if (digits) {
    const existing = await deps.suppliers.findSupplierByDoc(ctx.tenantId, digits);
    if (existing) {
      throw new BusinessRuleError('duplicate_supplier', 'Já existe fornecedor com esse documento');
    }
  }

  const pix = resolvePix(command.pixKey);
  const categoryId = await resolveCategory(deps, ctx, command.categoryId);

  return deps.suppliers.createSupplier({
    tenantId: ctx.tenantId,
    name,
    doc: digits,
    docType,
    pixKey: pix.pixKey,
    pixKeyType: pix.pixKeyType,
    phone: blankToNull(command.phone),
    email: blankToNull(command.email),
    notes: blankToNull(command.notes),
    categoryId,
  });
}

/** Confirma que a categoria (FO-04) existe e é do tenant; devolve o id ou null. */
export async function resolveCategory(
  deps: CreateSupplierDeps,
  ctx: RequestContext,
  categoryId: string | null | undefined,
): Promise<string | null> {
  if (!categoryId) return null;
  const category = await deps.suppliers.findCategoryById(ctx.tenantId, categoryId);
  if (!category) throw new NotFoundError('categoria');
  return category.id;
}

/**
 * Valida o dígito verificador do documento e devolve o tipo resolvido. O tipo vem do
 * comando, ou é inferido pelo tamanho: 11 dígitos → CPF, 14 → CNPJ. Tamanho que não é
 * nenhum dos dois é recusado. `parseCpf`/`parseCnpj` lançam em dígito verificador errado.
 */
export function validateDoc(digits: string, hint: 'cpf' | 'cnpj' | undefined): 'cpf' | 'cnpj' {
  const type = hint ?? (digits.length === 11 ? 'cpf' : digits.length === 14 ? 'cnpj' : null);
  if (type === null) {
    throw new BusinessRuleError('invalid_supplier_doc', 'Documento não é um CPF nem um CNPJ');
  }
  if (type === 'cpf') {
    parseCpf(digits);
  } else {
    parseCnpj(digits);
  }
  return type;
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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

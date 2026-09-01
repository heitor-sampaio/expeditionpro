import { BusinessRuleError, ForbiddenError } from '../errors.js';
import { TERM_DOCUMENT_NAME } from './saveTermDraft.js';
import type { RequestContext } from '../context.js';
import type { AcceptanceRecord, LegalDocumentRepository } from './legalDocumentRepository.js';

/**
 * DOC-04/DOC-05 — registra o aceite do Termo vigente por um cliente, com canal, IP e
 * user agent (a prova). Único por (cliente, versão) — a unicidade é garantida no banco.
 * O cliente aceita para si; a equipe pode registrar no cadastro manual (canal 'admin').
 */

export interface AcceptTermDeps {
  readonly documents: LegalDocumentRepository;
  readonly clock: () => Date;
}

export interface AcceptTermCommand {
  readonly customerId: string;
  readonly channel: string; // 'site' | 'portal' | 'admin'
  readonly bookingId?: string | null;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
  // DOC-08: snapshot dos valores das variáveis no ato (contrato reconstruível sob demanda).
  readonly variables?: Record<string, string> | undefined;
}

export async function acceptTerm(
  deps: AcceptTermDeps,
  ctx: RequestContext,
  command: AcceptTermCommand,
): Promise<AcceptanceRecord> {
  if (ctx.actor.kind === 'customer' && ctx.actor.customerId !== command.customerId) {
    throw new ForbiddenError('Cliente só aceita por si');
  }
  const doc = await deps.documents.ensureTermDocument(ctx.tenantId, TERM_DOCUMENT_NAME);
  const current = await deps.documents.getCurrentPublished(ctx.tenantId, doc.id);
  if (!current) {
    throw new BusinessRuleError('no_published_term', 'Não há Termo publicado para aceitar');
  }
  return deps.documents.recordAcceptance({
    tenantId: ctx.tenantId,
    documentVersionId: current.id,
    customerId: command.customerId,
    bookingId: command.bookingId ?? null,
    acceptedAt: deps.clock(),
    channel: command.channel,
    ip: command.ip ?? null,
    userAgent: command.userAgent ?? null,
    pdfPath: null,
    variables: command.variables ?? {},
  });
}

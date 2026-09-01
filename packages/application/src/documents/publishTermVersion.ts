import { BusinessRuleError } from '../errors.js';
import { requireDocManager, TERM_DOCUMENT_NAME } from './saveTermDraft.js';
import type { RequestContext } from '../context.js';
import type { DocumentVersionRecord, LegalDocumentRepository } from './legalDocumentRepository.js';

/**
 * DOC-02/DOC-03 — publica o rascunho vigente, congelando a versão (imutável). O admin
 * marca se a mudança exige novo aceite; exigindo, o portal bloqueia quem só aceitou uma
 * versão anterior (a regra vive em `resolveAcceptanceRequirement`, no domínio).
 */

export interface PublishTermVersionDeps {
  readonly documents: LegalDocumentRepository;
  readonly clock: () => Date;
}

export interface PublishTermVersionCommand {
  readonly requiresReacceptance: boolean;
  readonly changeSummary: string | null;
}

export async function publishTermVersion(
  deps: PublishTermVersionDeps,
  ctx: RequestContext,
  command: PublishTermVersionCommand,
): Promise<DocumentVersionRecord> {
  requireDocManager(ctx);
  if (ctx.actor.kind !== 'team') {
    throw new BusinessRuleError('not_team', 'Publicação é da equipe');
  }
  const doc = await deps.documents.ensureTermDocument(ctx.tenantId, TERM_DOCUMENT_NAME);
  const draft = await deps.documents.getDraft(ctx.tenantId, doc.id);
  if (!draft) {
    throw new BusinessRuleError('no_draft', 'Não há rascunho para publicar');
  }
  return deps.documents.publishDraft({
    tenantId: ctx.tenantId,
    documentId: doc.id,
    requiresReacceptance: command.requiresReacceptance,
    changeSummary: command.changeSummary,
    publishedBy: ctx.actor.userId,
    publishedAt: deps.clock(),
  });
}

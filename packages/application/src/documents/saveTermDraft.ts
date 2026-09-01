import { renderMarkdownToSafeHtml } from '@expedition/domain';
import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { DocumentVersionRecord, LegalDocumentRepository } from './legalDocumentRepository.js';

/**
 * DOC-01 — salva o rascunho do Termo de Adesão (Configurações → Documentos). A fonte é
 * Markdown; o HTML exibido é renderizado por allowlist (DOC-09) já aqui, para o conteúdo
 * guardado nunca conter tag perigosa. O rascunho é editável à vontade; só publicar
 * congela (DOC-02). Operação sensível: owner/admin.
 */

export const TERM_DOCUMENT_NAME = 'Termo de Adesão';

export interface SaveTermDraftDeps {
  readonly documents: LegalDocumentRepository;
}

export interface SaveTermDraftCommand {
  readonly markdown: string;
}

export async function saveTermDraft(
  deps: SaveTermDraftDeps,
  ctx: RequestContext,
  command: SaveTermDraftCommand,
): Promise<DocumentVersionRecord> {
  requireDocManager(ctx);
  const doc = await deps.documents.ensureTermDocument(ctx.tenantId, TERM_DOCUMENT_NAME);
  return deps.documents.saveDraft({
    tenantId: ctx.tenantId,
    documentId: doc.id,
    contentJson: { format: 'markdown', markdown: command.markdown },
    contentHtml: renderMarkdownToSafeHtml(command.markdown),
  });
}

/** Edição/publicação do Termo é de owner/admin (§3.7). */
export function requireDocManager(ctx: RequestContext): void {
  const actor = ctx.actor;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Editar o Termo exige owner ou admin');
  }
}

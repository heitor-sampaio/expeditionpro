import { requireDocManager, TERM_DOCUMENT_NAME } from './saveTermDraft.js';
import type { RequestContext } from '../context.js';
import type { DocumentVersionRecord, LegalDocumentRepository } from './legalDocumentRepository.js';

/**
 * DOC-01 — estado do editor de Documentos (Configurações): o rascunho atual (se houver)
 * e a versão publicada vigente, para a equipe editar/comparar. Owner/admin.
 */

export interface GetTermEditorStateDeps {
  readonly documents: LegalDocumentRepository;
}

export interface TermEditorState {
  readonly documentId: string;
  readonly draft: DocumentVersionRecord | null;
  readonly current: DocumentVersionRecord | null;
}

export async function getTermEditorState(
  deps: GetTermEditorStateDeps,
  ctx: RequestContext,
): Promise<TermEditorState> {
  requireDocManager(ctx);
  const doc = await deps.documents.ensureTermDocument(ctx.tenantId, TERM_DOCUMENT_NAME);
  const [draft, current] = await Promise.all([
    deps.documents.getDraft(ctx.tenantId, doc.id),
    deps.documents.getCurrentPublished(ctx.tenantId, doc.id),
  ]);
  return { documentId: doc.id, draft, current };
}

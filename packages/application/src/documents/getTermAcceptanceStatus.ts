import { resolveAcceptanceRequirement } from '@expedition/domain';
import { ForbiddenError } from '../errors.js';
import { TERM_DOCUMENT_NAME } from './saveTermDraft.js';
import type { RequestContext } from '../context.js';
import type { LegalDocumentRepository } from './legalDocumentRepository.js';

/**
 * DOC-03/DOC-04 — diz se um cliente precisa (re)aceitar o Termo vigente, e devolve a
 * versão a exibir. A decisão é pura (`resolveAcceptanceRequirement`); aqui só se busca o
 * estado. A equipe consulta qualquer cliente; o cliente consulta só a si mesmo (portal).
 */

export interface GetTermAcceptanceStatusDeps {
  readonly documents: LegalDocumentRepository;
}

export interface GetTermAcceptanceStatusCommand {
  readonly customerId: string;
}

export interface TermAcceptanceStatus {
  readonly mustAccept: boolean;
  readonly versionId: string | null;
  readonly versionNumber: number | null;
  readonly contentHtml: string | null;
}

export async function getTermAcceptanceStatus(
  deps: GetTermAcceptanceStatusDeps,
  ctx: RequestContext,
  command: GetTermAcceptanceStatusCommand,
): Promise<TermAcceptanceStatus> {
  if (ctx.actor.kind === 'customer' && ctx.actor.customerId !== command.customerId) {
    throw new ForbiddenError('Cliente só consulta o próprio aceite');
  }
  const doc = await deps.documents.ensureTermDocument(ctx.tenantId, TERM_DOCUMENT_NAME);
  const current = await deps.documents.getCurrentPublished(ctx.tenantId, doc.id);
  const accepted = await deps.documents.listAcceptedVersionNumbers(
    ctx.tenantId,
    doc.id,
    command.customerId,
  );
  const requirement = resolveAcceptanceRequirement({
    current: current
      ? {
          id: current.id,
          versionNumber: current.versionNumber,
          requiresReacceptance: current.requiresReacceptance,
        }
      : null,
    acceptedVersionNumbers: accepted,
  });
  return {
    mustAccept: requirement.mustAccept,
    versionId: requirement.versionId ?? null,
    versionNumber: requirement.versionNumber ?? null,
    contentHtml: requirement.mustAccept && current ? current.contentHtml : null,
  };
}

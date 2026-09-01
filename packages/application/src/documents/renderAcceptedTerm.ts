import { renderTermTemplate } from '@expedition/domain';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { LegalDocumentRepository } from './legalDocumentRepository.js';

/**
 * DOC-08 — reconstrói o contrato aceito de uma inscrição sob demanda: o texto congelado
 * da versão + os valores do snapshot, renderizados na hora. Sem PDF por cliente. A equipe
 * vê qualquer contrato; o cliente só o próprio (a posse vem do `customerId` do aceite).
 */

export interface RenderAcceptedTermDeps {
  readonly documents: LegalDocumentRepository;
}

export interface RenderedTerm {
  readonly versionNumber: number;
  readonly contentHtml: string;
  readonly acceptedAt: Date;
}

export async function renderAcceptedTerm(
  deps: RenderAcceptedTermDeps,
  ctx: RequestContext,
  command: { readonly bookingId: string },
): Promise<RenderedTerm> {
  const accepted = await deps.documents.getAcceptedTermByBooking(ctx.tenantId, command.bookingId);
  if (!accepted) {
    throw new NotFoundError('termo aceito');
  }
  if (ctx.actor.kind === 'customer' && ctx.actor.customerId !== accepted.customerId) {
    throw new ForbiddenError('Cliente só vê o próprio contrato');
  }
  return {
    versionNumber: accepted.versionNumber,
    contentHtml: renderTermTemplate(accepted.contentHtml, accepted.variables),
    acceptedAt: accepted.acceptedAt,
  };
}

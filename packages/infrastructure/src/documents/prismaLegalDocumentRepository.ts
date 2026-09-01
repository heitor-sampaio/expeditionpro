import { BusinessRuleError } from '@expedition/application';
import type {
  AcceptanceInputRow,
  AcceptanceRecord,
  AcceptedTerm,
  DocumentVersionRecord,
  LegalDocumentRecord,
  LegalDocumentRepository,
  PublishInput,
  SaveDraftInput,
} from '@expedition/application';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  DocumentAcceptance as AcceptanceRow,
  LegalDocument as DocRow,
  LegalDocumentVersion as VersionRow,
} from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma do Termo de Adesão (§5.13). O rascunho é a versão com
 * `published_at` nulo; publicar a congela. O tenant é injetado pela Client Extension;
 * a unicidade `(document_version_id, customer_id)` e `(document_id, version_number)`
 * é garantida no banco.
 */
export function prismaLegalDocumentRepository(base: PrismaClient): LegalDocumentRepository {
  return {
    async ensureTermDocument(tenantId: string, name: string): Promise<LegalDocumentRecord> {
      const db = tenantClient(base, tenantId);
      const existing = await db.legalDocument.findFirst({ where: { kind: 'term' } });
      if (existing) return toDoc(existing);
      const created = await db.legalDocument.create({
        data: { tenantId, kind: 'term', name, isActive: true },
      });
      return toDoc(created);
    },

    async getDraft(tenantId: string, documentId: string): Promise<DocumentVersionRecord | null> {
      const row = await tenantClient(base, tenantId).legalDocumentVersion.findFirst({
        where: { documentId, publishedAt: null },
      });
      return row ? toVersion(row) : null;
    },

    async saveDraft(input: SaveDraftInput): Promise<DocumentVersionRecord> {
      const db = tenantClient(base, input.tenantId);
      const draft = await db.legalDocumentVersion.findFirst({
        where: { documentId: input.documentId, publishedAt: null },
      });
      if (draft) {
        const updated = await db.legalDocumentVersion.update({
          where: { id: draft.id },
          data: {
            contentJson: input.contentJson as Prisma.InputJsonValue,
            contentHtml: input.contentHtml,
          },
        });
        return toVersion(updated);
      }
      const agg = await db.legalDocumentVersion.aggregate({
        where: { documentId: input.documentId },
        _max: { versionNumber: true },
      });
      const nextNumber = (agg._max.versionNumber ?? 0) + 1;
      const created = await db.legalDocumentVersion.create({
        data: {
          tenantId: input.tenantId,
          documentId: input.documentId,
          versionNumber: nextNumber,
          contentJson: input.contentJson as Prisma.InputJsonValue,
          contentHtml: input.contentHtml,
        },
      });
      return toVersion(created);
    },

    async publishDraft(input: PublishInput): Promise<DocumentVersionRecord> {
      const db = tenantClient(base, input.tenantId);
      const draft = await db.legalDocumentVersion.findFirst({
        where: { documentId: input.documentId, publishedAt: null },
      });
      if (!draft) throw new Error('no_draft');
      const published = await db.legalDocumentVersion.update({
        where: { id: draft.id },
        data: {
          requiresReacceptance: input.requiresReacceptance,
          changeSummary: input.changeSummary,
          publishedAt: input.publishedAt,
          publishedBy: input.publishedBy,
        },
      });
      return toVersion(published);
    },

    async getCurrentPublished(
      tenantId: string,
      documentId: string,
    ): Promise<DocumentVersionRecord | null> {
      const row = await tenantClient(base, tenantId).legalDocumentVersion.findFirst({
        where: { documentId, publishedAt: { not: null } },
        orderBy: { versionNumber: 'desc' },
      });
      return row ? toVersion(row) : null;
    },

    async listAcceptedVersionNumbers(
      tenantId: string,
      documentId: string,
      customerId: string,
    ): Promise<number[]> {
      const rows = await tenantClient(base, tenantId).documentAcceptance.findMany({
        where: { customerId, version: { documentId } },
        select: { version: { select: { versionNumber: true } } },
      });
      return rows.map((r) => r.version.versionNumber);
    },

    async recordAcceptance(input: AcceptanceInputRow): Promise<AcceptanceRecord> {
      try {
        const row = await tenantClient(base, input.tenantId).documentAcceptance.create({
          data: {
            tenantId: input.tenantId,
            documentVersionId: input.documentVersionId,
            customerId: input.customerId,
            bookingId: input.bookingId,
            acceptedAt: input.acceptedAt,
            channel: input.channel,
            ip: input.ip,
            userAgent: input.userAgent,
            pdfPath: input.pdfPath,
            variables: input.variables as Prisma.InputJsonValue,
          },
        });
        return toAcceptance(row);
      } catch (error) {
        // DOC-04: aceite único por (cliente, versão) — a violação do unique vira erro de
        // negócio (409/400), não 500. Qualquer outro erro sobe intacto.
        if ((error as { code?: string }).code === 'P2002') {
          throw new BusinessRuleError('already_accepted', 'Aceite já registrado');
        }
        throw error;
      }
    },

    async getAcceptedTermByBooking(
      tenantId: string,
      bookingId: string,
    ): Promise<AcceptedTerm | null> {
      const row = await tenantClient(base, tenantId).documentAcceptance.findFirst({
        where: { bookingId },
        select: {
          customerId: true,
          acceptedAt: true,
          variables: true,
          version: { select: { versionNumber: true, contentHtml: true } },
        },
      });
      if (!row) return null;
      return {
        customerId: row.customerId,
        versionNumber: row.version.versionNumber,
        contentHtml: row.version.contentHtml,
        variables: (row.variables ?? {}) as Record<string, string>,
        acceptedAt: row.acceptedAt,
      };
    },
  };
}

function toDoc(row: DocRow): LegalDocumentRecord {
  return { id: row.id, kind: row.kind, name: row.name, isActive: row.isActive };
}

function toVersion(row: VersionRow): DocumentVersionRecord {
  return {
    id: row.id,
    documentId: row.documentId,
    versionNumber: row.versionNumber,
    contentJson: row.contentJson,
    contentHtml: row.contentHtml,
    changeSummary: row.changeSummary,
    requiresReacceptance: row.requiresReacceptance,
    publishedAt: row.publishedAt,
    publishedBy: row.publishedBy,
  };
}

function toAcceptance(row: AcceptanceRow): AcceptanceRecord {
  return {
    id: row.id,
    documentVersionId: row.documentVersionId,
    customerId: row.customerId,
    acceptedAt: row.acceptedAt,
    channel: row.channel,
  };
}

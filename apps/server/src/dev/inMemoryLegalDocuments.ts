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

interface DocRow extends LegalDocumentRecord {
  readonly tenantId: string;
}
interface VersionRow extends DocumentVersionRecord {
  readonly tenantId: string;
}
interface AcceptRow extends AcceptanceRecord {
  readonly tenantId: string;
  readonly versionNumber: number;
  readonly bookingId: string | null;
  readonly variables: Record<string, string>;
}

/** Termo de adesão em memória — SÓ para dev e testes de rota. Espelha o fake do domínio. */
export function inMemoryLegalDocuments(): LegalDocumentRepository {
  const docs: DocRow[] = [];
  const versions: VersionRow[] = [];
  const acceptances: AcceptRow[] = [];
  let seq = 0;

  const draftOf = (tenantId: string, documentId: string) =>
    versions.find(
      (v) => v.tenantId === tenantId && v.documentId === documentId && v.publishedAt === null,
    );

  return {
    ensureTermDocument(tenantId, name) {
      let doc = docs.find((d) => d.tenantId === tenantId && d.kind === 'term');
      if (!doc) {
        seq += 1;
        doc = { id: `doc-${seq}`, tenantId, kind: 'term', name, isActive: true };
        docs.push(doc);
      }
      return Promise.resolve(doc);
    },
    getDraft(tenantId, documentId) {
      return Promise.resolve(draftOf(tenantId, documentId) ?? null);
    },
    saveDraft(input: SaveDraftInput) {
      const draft = draftOf(input.tenantId, input.documentId);
      if (draft) {
        const updated: VersionRow = {
          ...draft,
          contentJson: input.contentJson,
          contentHtml: input.contentHtml,
        };
        versions[versions.indexOf(draft)] = updated;
        return Promise.resolve(updated);
      }
      seq += 1;
      const maxNum = versions
        .filter((v) => v.tenantId === input.tenantId && v.documentId === input.documentId)
        .reduce((m, v) => Math.max(m, v.versionNumber), 0);
      const created: VersionRow = {
        id: `ver-${seq}`,
        tenantId: input.tenantId,
        documentId: input.documentId,
        versionNumber: maxNum + 1,
        contentJson: input.contentJson,
        contentHtml: input.contentHtml,
        changeSummary: null,
        requiresReacceptance: false,
        publishedAt: null,
        publishedBy: null,
      };
      versions.push(created);
      return Promise.resolve(created);
    },
    publishDraft(input: PublishInput) {
      const draft = draftOf(input.tenantId, input.documentId);
      if (!draft) return Promise.reject(new Error('no_draft'));
      const published: VersionRow = {
        ...draft,
        requiresReacceptance: input.requiresReacceptance,
        changeSummary: input.changeSummary,
        publishedAt: input.publishedAt,
        publishedBy: input.publishedBy,
      };
      versions[versions.indexOf(draft)] = published;
      return Promise.resolve(published);
    },
    getCurrentPublished(tenantId, documentId) {
      const published = versions
        .filter((v) => v.tenantId === tenantId && v.documentId === documentId && v.publishedAt)
        .sort((a, b) => b.versionNumber - a.versionNumber);
      return Promise.resolve(published[0] ?? null);
    },
    listAcceptedVersionNumbers(tenantId, documentId, customerId) {
      const nums = acceptances
        .filter((a) => a.tenantId === tenantId && a.customerId === customerId)
        .filter((a) =>
          versions.some((v) => v.id === a.documentVersionId && v.documentId === documentId),
        )
        .map((a) => a.versionNumber);
      return Promise.resolve(nums);
    },
    recordAcceptance(input: AcceptanceInputRow) {
      const version = versions.find(
        (v) => v.tenantId === input.tenantId && v.id === input.documentVersionId,
      );
      if (!version) return Promise.reject(new Error('no_version'));
      const dup = acceptances.some(
        (a) =>
          a.tenantId === input.tenantId &&
          a.customerId === input.customerId &&
          a.documentVersionId === input.documentVersionId,
      );
      if (dup) {
        return Promise.reject(new BusinessRuleError('already_accepted', 'Aceite já registrado'));
      }
      seq += 1;
      const row: AcceptRow = {
        id: `acc-${seq}`,
        tenantId: input.tenantId,
        documentVersionId: input.documentVersionId,
        customerId: input.customerId,
        acceptedAt: input.acceptedAt,
        channel: input.channel,
        versionNumber: version.versionNumber,
        bookingId: input.bookingId,
        variables: input.variables,
      };
      acceptances.push(row);
      return Promise.resolve(row);
    },
    getAcceptedTermByBooking(tenantId, bookingId): Promise<AcceptedTerm | null> {
      const acc = acceptances.find((a) => a.tenantId === tenantId && a.bookingId === bookingId);
      if (!acc) return Promise.resolve(null);
      const version = versions.find(
        (v) => v.tenantId === tenantId && v.id === acc.documentVersionId,
      );
      if (!version) return Promise.resolve(null);
      return Promise.resolve({
        customerId: acc.customerId,
        versionNumber: acc.versionNumber,
        contentHtml: version.contentHtml,
        variables: acc.variables,
        acceptedAt: acc.acceptedAt,
      });
    },
  };
}

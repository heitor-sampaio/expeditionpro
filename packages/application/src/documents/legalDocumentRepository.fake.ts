import { BusinessRuleError } from '../errors.js';
import type {
  AcceptanceInputRow,
  AcceptanceRecord,
  AcceptedTerm,
  DocumentVersionRecord,
  LegalDocumentRecord,
  LegalDocumentRepository,
  PublishInput,
  SaveDraftInput,
} from './legalDocumentRepository.js';

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

/** Fake in-memory do Termo de Adesão. Excluído do build (`*.fake.ts`). */
export function fakeLegalDocumentRepository(): LegalDocumentRepository & {
  docs: DocRow[];
  versions: VersionRow[];
  acceptances: AcceptRow[];
} {
  const docs: DocRow[] = [];
  const versions: VersionRow[] = [];
  const acceptances: AcceptRow[] = [];
  let seq = 0;

  const versionOf = (tenantId: string, id: string) =>
    versions.find((v) => v.tenantId === tenantId && v.id === id);

  return {
    docs,
    versions,
    acceptances,

    ensureTermDocument(tenantId: string, name: string) {
      let doc = docs.find((d) => d.tenantId === tenantId && d.kind === 'term');
      if (!doc) {
        seq += 1;
        doc = { id: `doc-${seq}`, tenantId, kind: 'term', name, isActive: true };
        docs.push(doc);
      }
      return Promise.resolve(doc);
    },

    getDraft(tenantId: string, documentId: string) {
      const draft = versions.find(
        (v) => v.tenantId === tenantId && v.documentId === documentId && v.publishedAt === null,
      );
      return Promise.resolve(draft ?? null);
    },

    saveDraft(input: SaveDraftInput) {
      const existing = versions.find(
        (v) =>
          v.tenantId === input.tenantId &&
          v.documentId === input.documentId &&
          v.publishedAt === null,
      );
      if (existing) {
        const updated: VersionRow = {
          ...existing,
          contentJson: input.contentJson,
          contentHtml: input.contentHtml,
        };
        versions[versions.indexOf(existing)] = updated;
        return Promise.resolve(updated);
      }
      seq += 1;
      const maxNum = versions
        .filter((v) => v.tenantId === input.tenantId && v.documentId === input.documentId)
        .reduce((max, v) => Math.max(max, v.versionNumber), 0);
      const draft: VersionRow = {
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
      versions.push(draft);
      return Promise.resolve(draft);
    },

    publishDraft(input: PublishInput) {
      const draft = versions.find(
        (v) =>
          v.tenantId === input.tenantId &&
          v.documentId === input.documentId &&
          v.publishedAt === null,
      );
      if (!draft) return Promise.reject(new BusinessRuleError('no_draft', 'Sem rascunho'));
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

    getCurrentPublished(tenantId: string, documentId: string) {
      const published = versions
        .filter((v) => v.tenantId === tenantId && v.documentId === documentId && v.publishedAt)
        .sort((a, b) => b.versionNumber - a.versionNumber);
      return Promise.resolve(published[0] ?? null);
    },

    listAcceptedVersionNumbers(tenantId: string, documentId: string, customerId: string) {
      const nums = acceptances
        .filter((a) => a.tenantId === tenantId && a.customerId === customerId)
        .filter((a) =>
          versions.some((v) => v.id === a.documentVersionId && v.documentId === documentId),
        )
        .map((a) => a.versionNumber);
      return Promise.resolve(nums);
    },

    recordAcceptance(input: AcceptanceInputRow) {
      const version = versionOf(input.tenantId, input.documentVersionId);
      if (!version)
        return Promise.reject(new BusinessRuleError('no_version', 'Versão inexistente'));
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

    getAcceptedTermByBooking(tenantId: string, bookingId: string): Promise<AcceptedTerm | null> {
      const acc = acceptances.find((a) => a.tenantId === tenantId && a.bookingId === bookingId);
      if (!acc) return Promise.resolve(null);
      const version = versionOf(tenantId, acc.documentVersionId);
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

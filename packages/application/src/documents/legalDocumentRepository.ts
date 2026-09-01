/**
 * Port do Termo de Adesão (§5.13). Um documento por tenant (o Termo), com versões: a
 * última pode ser rascunho (`publishedAt` nulo); publicar congela e torna imutável.
 * O aceite é gravado por (cliente, versão) — a prova de consentimento (DOC-04/DOC-05).
 */

export interface LegalDocumentRecord {
  readonly id: string;
  readonly kind: string; // 'term' (Termo de Adesão)
  readonly name: string;
  readonly isActive: boolean;
}

export interface DocumentVersionRecord {
  readonly id: string;
  readonly documentId: string;
  readonly versionNumber: number;
  readonly contentJson: unknown;
  readonly contentHtml: string;
  readonly changeSummary: string | null;
  readonly requiresReacceptance: boolean;
  readonly publishedAt: Date | null;
  readonly publishedBy: string | null;
}

export interface SaveDraftInput {
  readonly tenantId: string;
  readonly documentId: string;
  readonly contentJson: unknown;
  readonly contentHtml: string;
}

export interface PublishInput {
  readonly tenantId: string;
  readonly documentId: string;
  readonly requiresReacceptance: boolean;
  readonly changeSummary: string | null;
  readonly publishedBy: string;
  readonly publishedAt: Date;
}

export interface AcceptanceInputRow {
  readonly tenantId: string;
  readonly documentVersionId: string;
  readonly customerId: string;
  readonly bookingId: string | null;
  readonly acceptedAt: Date;
  readonly channel: string; // 'site' | 'portal' | 'admin'
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly pdfPath: string | null;
  // DOC-08: valores resolvidos das variáveis no ato (snapshot). Reconstrói o contrato
  // exato sob demanda, sem PDF por cliente.
  readonly variables: Record<string, string>;
}

export interface AcceptanceRecord {
  readonly id: string;
  readonly documentVersionId: string;
  readonly customerId: string;
  readonly acceptedAt: Date;
  readonly channel: string;
}

/** O contrato aceito de uma inscrição: o texto congelado da versão + os valores do aceite. */
export interface AcceptedTerm {
  readonly customerId: string;
  readonly versionNumber: number;
  readonly contentHtml: string;
  readonly variables: Record<string, string>;
  readonly acceptedAt: Date;
}

export interface LegalDocumentRepository {
  /** O Termo do tenant (kind 'term'), criado sob demanda se ainda não existe. */
  ensureTermDocument(tenantId: string, name: string): Promise<LegalDocumentRecord>;
  /** Rascunho atual (versão não publicada), ou null. */
  getDraft(tenantId: string, documentId: string): Promise<DocumentVersionRecord | null>;
  /** Cria/atualiza o rascunho com o conteúdo dado; devolve a versão-rascunho. */
  saveDraft(input: SaveDraftInput): Promise<DocumentVersionRecord>;
  /** Congela o rascunho como publicado e imutável (mantém o número já atribuído). */
  publishDraft(input: PublishInput): Promise<DocumentVersionRecord>;
  /** Versão publicada vigente (maior número com `publishedAt`), ou null. */
  getCurrentPublished(tenantId: string, documentId: string): Promise<DocumentVersionRecord | null>;
  /** Números de versão que o cliente já aceitou. */
  listAcceptedVersionNumbers(
    tenantId: string,
    documentId: string,
    customerId: string,
  ): Promise<number[]>;
  /** Registra um aceite (único por cliente+versão). */
  recordAcceptance(input: AcceptanceInputRow): Promise<AcceptanceRecord>;
  /** Contrato aceito de uma inscrição (DOC-08), para renderizar sob demanda. */
  getAcceptedTermByBooking(tenantId: string, bookingId: string): Promise<AcceptedTerm | null>;
}

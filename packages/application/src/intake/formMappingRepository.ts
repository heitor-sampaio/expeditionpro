/**
 * Port do mapa `form_id` → roteiro (IN-20). Config da integração por origem: a alocação
 * usa o roteiro resolvido para filtrar os grupos certos. Só a equipe lê/escreve (§2.2);
 * é injetado pela Prisma Client Extension como toda tabela de negócio.
 */

export interface FormMappingRecord {
  readonly id: string;
  readonly source: string;
  readonly formId: string;
  readonly itineraryId: string;
}

export interface FormMappingRepository {
  /** Resolve o roteiro de um `(source, form_id)`; null se não houver mapa. */
  resolveItinerary(tenantId: string, source: string, formId: string): Promise<string | null>;
  list(tenantId: string): Promise<FormMappingRecord[]>;
  /** Cria ou atualiza o mapa de `(source, form_id)` (unique composto). */
  upsert(
    tenantId: string,
    source: string,
    formId: string,
    itineraryId: string,
  ): Promise<FormMappingRecord>;
  /** Remove o mapa por id. false se não existe no tenant. */
  remove(tenantId: string, id: string): Promise<boolean>;
}

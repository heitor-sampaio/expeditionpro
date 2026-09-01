import type { FormMappingRecord, FormMappingRepository } from '@expedition/application';

/** Mapa form_id→roteiro em memória — SÓ para dev sem banco e testes de rota. */
export function inMemoryFormMappings(): FormMappingRepository {
  const rows: (FormMappingRecord & { tenantId: string })[] = [];
  let seq = 0;
  return {
    resolveItinerary(tenantId: string, source: string, formId: string) {
      const row = rows.find(
        (r) => r.tenantId === tenantId && r.source === source && r.formId === formId,
      );
      return Promise.resolve(row?.itineraryId ?? null);
    },
    list(tenantId: string) {
      return Promise.resolve(rows.filter((r) => r.tenantId === tenantId));
    },
    upsert(tenantId: string, source: string, formId: string, itineraryId: string) {
      const i = rows.findIndex(
        (r) => r.tenantId === tenantId && r.source === source && r.formId === formId,
      );
      if (i !== -1) {
        const updated = { ...rows[i]!, itineraryId };
        rows[i] = updated;
        return Promise.resolve(updated);
      }
      seq += 1;
      const record = { id: `dev-fm-${seq}`, tenantId, source, formId, itineraryId };
      rows.push(record);
      return Promise.resolve(record);
    },
    remove(tenantId: string, id: string) {
      const i = rows.findIndex((r) => r.tenantId === tenantId && r.id === id);
      if (i === -1) return Promise.resolve(false);
      rows.splice(i, 1);
      return Promise.resolve(true);
    },
  };
}

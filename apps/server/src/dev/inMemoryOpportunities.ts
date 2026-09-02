import type {
  NewOpportunity,
  NewOpportunityStage,
  OpportunityPatch,
  OpportunityRecord,
  OpportunityRepository,
  OpportunityStageRecord,
} from '@expedition/application';

type StageRow = OpportunityStageRecord & { tenantId: string };
type OpportunityRow = OpportunityRecord & { tenantId: string; deleted: boolean };

/**
 * Funil em memória — SÓ para dev sem banco e testes de rota (§5.16).
 *
 * Escrito aqui, e não reaproveitado do fake da aplicação, porque `*.fake.ts` fica fora do
 * build daquele pacote: o servidor não alcança. É a mesma razão de `inMemoryMemberships`.
 */
export function inMemoryOpportunities(
  seedStages: readonly StageRow[] = [],
): OpportunityRepository & { stages: StageRow[]; opportunities: OpportunityRow[] } {
  const stages: StageRow[] = [...seedStages];
  const opportunities: OpportunityRow[] = [];
  let seq = 0;

  const vivas = (tenantId: string): OpportunityRow[] =>
    opportunities.filter((o) => o.tenantId === tenantId && !o.deleted);

  return {
    stages,
    opportunities,

    listStages: (tenantId) =>
      Promise.resolve(
        stages
          .filter((s) => s.tenantId === tenantId && s.archivedAt === null)
          .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
      ),

    findStageById: (tenantId, stageId) =>
      Promise.resolve(stages.find((s) => s.tenantId === tenantId && s.id === stageId) ?? null),

    findStageByName: (tenantId, name) =>
      Promise.resolve(
        stages.find(
          (s) =>
            s.tenantId === tenantId &&
            s.archivedAt === null &&
            s.name.toLowerCase() === name.trim().toLowerCase(),
        ) ?? null,
      ),

    createStage(stage: NewOpportunityStage) {
      seq += 1;
      const record: StageRow = {
        tenantId: stage.tenantId,
        id: `stage-${seq}`,
        name: stage.name,
        position: stage.position,
        kind: stage.kind,
        archivedAt: null,
      };
      stages.push(record);
      return Promise.resolve(record);
    },

    renameStage(tenantId, stageId, name) {
      const i = stages.findIndex((s) => s.tenantId === tenantId && s.id === stageId);
      stages[i] = { ...stages[i]!, name };
      return Promise.resolve(stages[i]!);
    },

    reorderStages(tenantId, orderedStageIds) {
      orderedStageIds.forEach((id, position) => {
        const i = stages.findIndex((s) => s.tenantId === tenantId && s.id === id);
        if (i >= 0) stages[i] = { ...stages[i]!, position };
      });
      return Promise.resolve();
    },

    archiveStage(tenantId, stageId) {
      const i = stages.findIndex((s) => s.tenantId === tenantId && s.id === stageId);
      if (i >= 0) stages[i] = { ...stages[i]!, archivedAt: new Date() };
      return Promise.resolve();
    },

    countOpportunitiesByStage: (tenantId, stageId) =>
      Promise.resolve(vivas(tenantId).filter((o) => o.stageId === stageId).length),

    listOpportunities: (tenantId) => Promise.resolve(vivas(tenantId)),

    findOpportunityById: (tenantId, id) =>
      Promise.resolve(vivas(tenantId).find((o) => o.id === id) ?? null),

    createOpportunity(opportunity: NewOpportunity) {
      seq += 1;
      const agora = new Date();
      const record: OpportunityRow = {
        tenantId: opportunity.tenantId,
        id: `opp-${seq}`,
        stageId: opportunity.stageId,
        contactName: opportunity.contactName,
        phone: opportunity.phone,
        email: opportunity.email,
        itineraryId: opportunity.itineraryId,
        customerId: opportunity.customerId,
        bookingId: null,
        expectedValueCents: opportunity.expectedValueCents,
        source: opportunity.source,
        lostReason: null,
        createdAt: agora,
        updatedAt: agora,
        deleted: false,
      };
      opportunities.push(record);
      return Promise.resolve(record);
    },

    updateOpportunity(tenantId, id, patch: OpportunityPatch) {
      const i = opportunities.findIndex(
        (o) => o.tenantId === tenantId && o.id === id && !o.deleted,
      );
      opportunities[i] = {
        ...opportunities[i]!,
        ...(patch.stageId === undefined ? {} : { stageId: patch.stageId }),
        ...(patch.contactName === undefined ? {} : { contactName: patch.contactName }),
        ...(patch.phone === undefined ? {} : { phone: patch.phone }),
        ...(patch.email === undefined ? {} : { email: patch.email }),
        ...(patch.itineraryId === undefined ? {} : { itineraryId: patch.itineraryId }),
        ...(patch.customerId === undefined ? {} : { customerId: patch.customerId }),
        ...(patch.bookingId === undefined ? {} : { bookingId: patch.bookingId }),
        ...(patch.expectedValueCents === undefined
          ? {}
          : { expectedValueCents: patch.expectedValueCents }),
        ...(patch.lostReason === undefined ? {} : { lostReason: patch.lostReason }),
        updatedAt: new Date(),
      };
      return Promise.resolve(opportunities[i]!);
    },

    softDeleteOpportunity(tenantId, id) {
      const i = opportunities.findIndex((o) => o.tenantId === tenantId && o.id === id);
      if (i >= 0) opportunities[i] = { ...opportunities[i]!, deleted: true };
      return Promise.resolve();
    },
  };
}

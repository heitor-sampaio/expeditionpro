import { NotFoundError } from '../errors.js';
import type {
  NewOpportunity,
  NewOpportunityStage,
  OpportunityPatch,
  OpportunityRecord,
  OpportunityRepository,
  OpportunityStageRecord,
} from './opportunityRepository.js';

type StageRow = OpportunityStageRecord & { tenantId: string };
type OpportunityRow = OpportunityRecord & { tenantId: string; deleted: boolean };

/** Fake in-memory do funil (§5.16). Fora do build. */
export function fakeOpportunityRepository(seed?: {
  readonly stages?: readonly StageRow[];
  readonly opportunities?: readonly OpportunityRow[];
}): OpportunityRepository & { stages: StageRow[]; opportunities: OpportunityRow[] } {
  const stages: StageRow[] = [...(seed?.stages ?? [])];
  const opportunities: OpportunityRow[] = [...(seed?.opportunities ?? [])];
  let seq = 0;

  const vivas = (tenantId: string): OpportunityRow[] =>
    opportunities.filter((o) => o.tenantId === tenantId && !o.deleted);

  return {
    stages,
    opportunities,

    listStages(tenantId: string) {
      return Promise.resolve(
        stages
          .filter((s) => s.tenantId === tenantId && s.archivedAt === null)
          .sort((a, b) => a.position - b.position),
      );
    },

    findStageById(tenantId: string, stageId: string) {
      return Promise.resolve(
        stages.find((s) => s.tenantId === tenantId && s.id === stageId) ?? null,
      );
    },

    findStageByName(tenantId: string, name: string) {
      const alvo = name.trim().toLowerCase();
      return Promise.resolve(
        stages.find(
          (s) => s.tenantId === tenantId && s.archivedAt === null && s.name.toLowerCase() === alvo,
        ) ?? null,
      );
    },

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

    renameStage(tenantId: string, stageId: string, name: string) {
      const i = stages.findIndex((s) => s.tenantId === tenantId && s.id === stageId);
      if (i < 0) return Promise.reject(new NotFoundError('etapa'));
      stages[i] = { ...stages[i]!, name };
      return Promise.resolve(stages[i]!);
    },

    reorderStages(tenantId: string, orderedStageIds: readonly string[]) {
      orderedStageIds.forEach((id, posicao) => {
        const i = stages.findIndex((s) => s.tenantId === tenantId && s.id === id);
        if (i >= 0) stages[i] = { ...stages[i]!, position: posicao };
      });
      return Promise.resolve();
    },

    archiveStage(tenantId: string, stageId: string) {
      const i = stages.findIndex((s) => s.tenantId === tenantId && s.id === stageId);
      if (i >= 0) stages[i] = { ...stages[i]!, archivedAt: new Date('2026-09-02T00:00:00Z') };
      return Promise.resolve();
    },

    countOpportunitiesByStage(tenantId: string, stageId: string) {
      return Promise.resolve(vivas(tenantId).filter((o) => o.stageId === stageId).length);
    },

    listOpportunities(tenantId: string) {
      return Promise.resolve(vivas(tenantId));
    },

    findOpportunityById(tenantId: string, id: string) {
      return Promise.resolve(vivas(tenantId).find((o) => o.id === id) ?? null);
    },

    createOpportunity(opportunity: NewOpportunity) {
      seq += 1;
      const agora = new Date('2026-09-02T00:00:00Z');
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

    updateOpportunity(tenantId: string, id: string, patch: OpportunityPatch) {
      const i = opportunities.findIndex(
        (o) => o.tenantId === tenantId && o.id === id && !o.deleted,
      );
      if (i < 0) return Promise.reject(new NotFoundError('oportunidade'));
      const atual = opportunities[i]!;
      opportunities[i] = {
        ...atual,
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
        updatedAt: new Date('2026-09-02T01:00:00Z'),
      };
      return Promise.resolve(opportunities[i]!);
    },

    softDeleteOpportunity(tenantId: string, id: string) {
      const i = opportunities.findIndex((o) => o.tenantId === tenantId && o.id === id);
      if (i >= 0) opportunities[i] = { ...opportunities[i]!, deleted: true };
      return Promise.resolve();
    },
  };
}

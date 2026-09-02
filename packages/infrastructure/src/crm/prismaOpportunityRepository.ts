import { cents } from '@expedition/domain';
import type {
  NewOpportunity,
  NewOpportunityStage,
  OpportunityPatch,
  OpportunityRecord,
  OpportunityRepository,
  OpportunitySource,
  OpportunityStageRecord,
  StageKind,
} from '@expedition/application';
import type {
  Opportunity as PrismaOpportunity,
  OpportunityStage as PrismaStage,
} from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { runInTransaction, tenantClient } from '../prisma/tenantClient.js';

/**
 * §5.16 — persistência do funil.
 *
 * Nada aqui é lido por relatório financeiro (OP-09): o valor previsto sai desta tabela e não
 * entra em soma nenhuma do §3.6.
 */
export function prismaOpportunityRepository(base: PrismaClient): OpportunityRepository {
  return {
    async listStages(tenantId: string): Promise<OpportunityStageRecord[]> {
      const rows = await tenantClient(base, tenantId).opportunityStage.findMany({
        where: { archivedAt: null },
        // Desempate por nome porque `position` não é única (etapa arquivada guarda a dela):
        // sem o segundo critério, duas na mesma posição sairiam em ordem imprevisível.
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
      });
      return rows.map(toStage);
    },

    async findStageById(tenantId: string, stageId: string): Promise<OpportunityStageRecord | null> {
      const row = await tenantClient(base, tenantId).opportunityStage.findFirst({
        where: { id: stageId },
      });
      return row ? toStage(row) : null;
    },

    async findStageByName(tenantId: string, name: string): Promise<OpportunityStageRecord | null> {
      const row = await tenantClient(base, tenantId).opportunityStage.findFirst({
        // `mode: 'insensitive'`: "Novo" e "novo" são a mesma coluna para quem olha o quadro.
        where: { name: { equals: name, mode: 'insensitive' }, archivedAt: null },
      });
      return row ? toStage(row) : null;
    },

    async createStage(stage: NewOpportunityStage): Promise<OpportunityStageRecord> {
      const row = await tenantClient(base, stage.tenantId).opportunityStage.create({
        data: {
          tenantId: stage.tenantId,
          name: stage.name,
          position: stage.position,
          kind: stage.kind,
        },
      });
      return toStage(row);
    },

    async renameStage(
      tenantId: string,
      stageId: string,
      name: string,
    ): Promise<OpportunityStageRecord> {
      const row = await tenantClient(base, tenantId).opportunityStage.update({
        where: { id: stageId },
        data: { name },
      });
      return toStage(row);
    },

    async reorderStages(tenantId: string, orderedStageIds: readonly string[]): Promise<void> {
      // Numa transação: metade da ordem gravada é pior que ordem nenhuma — o quadro ficaria
      // numa sequência que ninguém pediu e que não dá para desfazer olhando.
      await runInTransaction(base, async (tx) => {
        const escopado = tenantClient(tx, tenantId);
        for (const [position, id] of orderedStageIds.entries()) {
          await escopado.opportunityStage.update({ where: { id }, data: { position } });
        }
      });
    },

    async archiveStage(tenantId: string, stageId: string): Promise<void> {
      await tenantClient(base, tenantId).opportunityStage.update({
        where: { id: stageId },
        data: { archivedAt: new Date() },
      });
    },

    async countOpportunitiesByStage(tenantId: string, stageId: string): Promise<number> {
      return tenantClient(base, tenantId).opportunity.count({
        where: { stageId, deletedAt: null },
      });
    },

    async listOpportunities(tenantId: string): Promise<OpportunityRecord[]> {
      const rows = await tenantClient(base, tenantId).opportunity.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toOpportunity);
    },

    async findOpportunityById(tenantId: string, id: string): Promise<OpportunityRecord | null> {
      const row = await tenantClient(base, tenantId).opportunity.findFirst({
        where: { id, deletedAt: null },
      });
      return row ? toOpportunity(row) : null;
    },

    async createOpportunity(opportunity: NewOpportunity): Promise<OpportunityRecord> {
      const row = await tenantClient(base, opportunity.tenantId).opportunity.create({
        data: {
          tenantId: opportunity.tenantId,
          stageId: opportunity.stageId,
          contactName: opportunity.contactName,
          phone: opportunity.phone,
          email: opportunity.email,
          itineraryId: opportunity.itineraryId,
          customerId: opportunity.customerId,
          expectedValueCents:
            opportunity.expectedValueCents === null ? null : BigInt(opportunity.expectedValueCents),
          source: opportunity.source,
        } satisfies Record<keyof NewOpportunity | 'expectedValueCents', unknown>,
      });
      return toOpportunity(row);
    },

    async updateOpportunity(
      tenantId: string,
      id: string,
      patch: OpportunityPatch,
    ): Promise<OpportunityRecord> {
      const row = await tenantClient(base, tenantId).opportunity.update({
        where: { id },
        // Campo ausente preserva; `null` limpa. Escrever a lista à mão é o que deixou a
        // chave PIX gravar NULL uma vez (FO-07) — aqui cada campo do patch tem seu ramo.
        data: {
          ...(patch.stageId === undefined ? {} : { stageId: patch.stageId }),
          ...(patch.contactName === undefined ? {} : { contactName: patch.contactName }),
          ...(patch.phone === undefined ? {} : { phone: patch.phone }),
          ...(patch.email === undefined ? {} : { email: patch.email }),
          ...(patch.itineraryId === undefined ? {} : { itineraryId: patch.itineraryId }),
          ...(patch.customerId === undefined ? {} : { customerId: patch.customerId }),
          ...(patch.bookingId === undefined ? {} : { bookingId: patch.bookingId }),
          ...(patch.expectedValueCents === undefined
            ? {}
            : {
                expectedValueCents:
                  patch.expectedValueCents === null ? null : BigInt(patch.expectedValueCents),
              }),
          ...(patch.lostReason === undefined ? {} : { lostReason: patch.lostReason }),
        },
      });
      return toOpportunity(row);
    },

    async softDeleteOpportunity(tenantId: string, id: string): Promise<void> {
      await tenantClient(base, tenantId).opportunity.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    },
  };
}

function toStage(row: PrismaStage): OpportunityStageRecord {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    // O banco garante o conjunto por CHECK; a borda estreita o tipo.
    kind: row.kind as StageKind,
    archivedAt: row.archivedAt,
  };
}

function toOpportunity(row: PrismaOpportunity): OpportunityRecord {
  return {
    id: row.id,
    stageId: row.stageId,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    itineraryId: row.itineraryId,
    customerId: row.customerId,
    bookingId: row.bookingId,
    expectedValueCents:
      row.expectedValueCents === null ? null : cents(Number(row.expectedValueCents)),
    source: row.source as OpportunitySource,
    lostReason: row.lostReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

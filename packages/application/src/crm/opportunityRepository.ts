import type { Cents } from '@expedition/domain';

/**
 * §5.16 — o funil de oportunidades.
 *
 * **Oportunidade não é inscrição em outro estado.** A inscrição exige grupo (e a maior parte
 * das conversas morre antes de existir data escolhida), exige CPF (e pedir CPF para responder
 * um preço afasta a venda) e é o começo do rastro financeiro — enchê-la de quem nunca fechou
 * contamina o número que o §3.6 mantém confiável.
 *
 * **Oportunidade não é dinheiro.** `expectedValueCents` é aposta sobre o futuro; o ledger só
 * registra o que aconteceu. Nenhum relatório financeiro lê esta tabela (OP-09).
 */

/** `open` alimenta o funil; `won` e `lost` são terminais e é deles que sai a conversão. */
export type StageKind = 'open' | 'won' | 'lost';

export type OpportunitySource = 'manual' | 'whatsapp' | 'instagram' | 'messenger' | 'site';

export interface NewOpportunityStage {
  readonly tenantId: string;
  readonly name: string;
  readonly position: number;
  readonly kind: StageKind;
}

export interface OpportunityStageRecord {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly kind: StageKind;
  /** Arquivada some do quadro e continua existindo para o histórico não perder o nome. */
  readonly archivedAt: Date | null;
}

export interface NewOpportunity {
  readonly tenantId: string;
  readonly stageId: string;
  readonly contactName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly itineraryId: string | null;
  readonly customerId: string | null;
  readonly expectedValueCents: Cents | null;
  readonly source: OpportunitySource;
}

export interface OpportunityRecord {
  readonly id: string;
  readonly stageId: string;
  readonly contactName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly itineraryId: string | null;
  readonly customerId: string | null;
  /** Preenchido no fechamento (OP-08). Presente = a oportunidade virou inscrição e parou. */
  readonly bookingId: string | null;
  readonly expectedValueCents: Cents | null;
  readonly source: OpportunitySource;
  readonly lostReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** O que uma edição pode mudar. Ausente preserva; `null` limpa. */
export interface OpportunityPatch {
  readonly stageId?: string | undefined;
  readonly contactName?: string | undefined;
  readonly phone?: string | null | undefined;
  readonly email?: string | null | undefined;
  readonly itineraryId?: string | null | undefined;
  readonly customerId?: string | null | undefined;
  readonly bookingId?: string | null | undefined;
  readonly expectedValueCents?: Cents | null | undefined;
  readonly lostReason?: string | null | undefined;
}

export interface OpportunityRepository {
  /** Etapas ativas, em ordem de posição. Arquivadas ficam de fora. */
  listStages(tenantId: string): Promise<OpportunityStageRecord[]>;
  findStageById(tenantId: string, stageId: string): Promise<OpportunityStageRecord | null>;
  findStageByName(tenantId: string, name: string): Promise<OpportunityStageRecord | null>;
  createStage(stage: NewOpportunityStage): Promise<OpportunityStageRecord>;
  renameStage(tenantId: string, stageId: string, name: string): Promise<OpportunityStageRecord>;
  /** Reordena numa transação: posição é única por tenant e não aceita passo intermediário. */
  reorderStages(tenantId: string, orderedStageIds: readonly string[]): Promise<void>;
  archiveStage(tenantId: string, stageId: string): Promise<void>;
  /** OP-06: arquivar etapa com oportunidade dentro é bloqueado. */
  countOpportunitiesByStage(tenantId: string, stageId: string): Promise<number>;

  listOpportunities(tenantId: string): Promise<OpportunityRecord[]>;
  findOpportunityById(tenantId: string, id: string): Promise<OpportunityRecord | null>;
  createOpportunity(opportunity: NewOpportunity): Promise<OpportunityRecord>;
  updateOpportunity(
    tenantId: string,
    id: string,
    patch: OpportunityPatch,
  ): Promise<OpportunityRecord>;
  softDeleteOpportunity(tenantId: string, id: string): Promise<void>;
}

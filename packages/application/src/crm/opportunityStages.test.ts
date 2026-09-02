import { describe, expect, it } from 'vitest';
import { cents } from '@expedition/domain';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeOpportunityRepository } from './opportunityRepository.fake.js';
import { createStage } from './createStage.js';
import { renameStage } from './renameStage.js';
import { reorderStages } from './reorderStages.js';
import { archiveStage } from './archiveStage.js';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { OpportunityStageRecord } from './opportunityRepository.js';

function ctxCom(role: 'owner' | 'admin' | 'operator' | 'viewer'): RequestContext {
  return { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u1', role } };
}

const cliente: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u-cli', customerId: 'c1' },
};

const etapa = (
  id: string,
  name: string,
  position: number,
  kind: OpportunityStageRecord['kind'] = 'open',
) => ({ tenantId: 'tenant-a', id, name, position, kind, archivedAt: null });

function comFunil() {
  return fakeOpportunityRepository({
    stages: [
      etapa('s-novo', 'Novo', 0),
      etapa('s-conversa', 'Conversando', 1),
      etapa('s-ganho', 'Fechado', 2, 'won'),
    ],
  });
}

/**
 * OP-01 · OP-06 — as etapas do funil são configuráveis pelo tenant.
 *
 * A regra de arquivar é a mesma da categoria de fornecedor (FO-05), pelo mesmo motivo:
 * arquivar uma etapa com oportunidade dentro faria os cartões sumirem do quadro sem que
 * ninguém tivesse decidido descartá-los. Sumiço em silêncio é sempre a resposta errada.
 */
describe('OP-01: configurar as etapas do funil', () => {
  it('cria etapa no fim do funil', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();

    const nova = await createStage({ opportunities, audit }, ctxCom('admin'), {
      name: 'Proposta enviada',
      kind: 'open',
    });

    expect(nova).toMatchObject({ name: 'Proposta enviada', kind: 'open', position: 3 });
  });

  it('nome repetido é recusado — duas colunas iguais no quadro não distinguem nada', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();

    await expect(
      createStage({ opportunities, audit }, ctxCom('admin'), { name: 'novo', kind: 'open' }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('renomear mantém a posição e as oportunidades', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();

    const renomeada = await renameStage({ opportunities, audit }, ctxCom('owner'), {
      stageId: 's-conversa',
      name: 'Em negociação',
    });

    expect(renomeada).toMatchObject({ name: 'Em negociação', position: 1 });
  });

  it('reordenar grava a nova ordem inteira', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();

    await reorderStages({ opportunities, audit }, ctxCom('owner'), {
      orderedStageIds: ['s-conversa', 's-novo', 's-ganho'],
    });

    const ordem = (await opportunities.listStages('tenant-a')).map((s) => s.name);
    expect(ordem).toEqual(['Conversando', 'Novo', 'Fechado']);
  });

  it('reordenar exige a lista completa — ordem parcial deixaria posição duplicada', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();

    await expect(
      reorderStages({ opportunities, audit }, ctxCom('owner'), {
        orderedStageIds: ['s-conversa', 's-novo'],
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('operator não configura etapas — é o desenho do funil, não o trabalho do dia', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();

    await expect(
      createStage({ opportunities, audit }, ctxCom('operator'), { name: 'X', kind: 'open' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não chega nem perto', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();

    await expect(
      createStage({ opportunities, audit }, cliente, { name: 'X', kind: 'open' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('OP-06: arquivar etapa com oportunidade dentro é bloqueado', () => {
  function comCartaoNaEtapa() {
    const opportunities = comFunil();
    opportunities.opportunities.push({
      tenantId: 'tenant-a',
      id: 'opp-1',
      stageId: 's-conversa',
      contactName: 'Ana Prado',
      phone: null,
      email: null,
      itineraryId: null,
      customerId: null,
      bookingId: null,
      expectedValueCents: cents(200000),
      source: 'manual',
      lostReason: null,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      deleted: false,
    });
    return opportunities;
  }

  it('recusa, e diz quantas oportunidades estão lá', async () => {
    const opportunities = comCartaoNaEtapa();
    const audit = fakeAuditLogRepository();

    try {
      await archiveStage({ opportunities, audit }, ctxCom('owner'), { stageId: 's-conversa' });
      expect.unreachable('deveria ter recusado');
    } catch (erro) {
      expect(erro).toBeInstanceOf(BusinessRuleError);
      expect((erro as Error).message).toContain('1');
    }
  });

  it('etapa vazia arquiva e some do quadro', async () => {
    const opportunities = comCartaoNaEtapa();
    const audit = fakeAuditLogRepository();

    await archiveStage({ opportunities, audit }, ctxCom('owner'), { stageId: 's-novo' });

    const nomes = (await opportunities.listStages('tenant-a')).map((s) => s.name);
    expect(nomes).toEqual(['Conversando', 'Fechado']);
  });

  it('arquivar grava na trilha quem arquivou o quê', async () => {
    const opportunities = comCartaoNaEtapa();
    const audit = fakeAuditLogRepository();

    await archiveStage({ opportunities, audit }, ctxCom('owner'), { stageId: 's-novo' });

    const linhas = await audit.listByEntity('tenant-a', 'opportunity_stage', 's-novo');
    expect(linhas[0]).toMatchObject({
      actorUserId: 'u1',
      action: 'opportunity_stage.archive',
      diff: { name: 'Novo' },
    });
  });

  it('etapa de outro tenant responde como se não existisse', async () => {
    const opportunities = comCartaoNaEtapa();
    const audit = fakeAuditLogRepository();

    await expect(
      archiveStage(
        { opportunities, audit },
        { ...ctxCom('owner'), tenantId: 'tenant-b' },
        {
          stageId: 's-novo',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

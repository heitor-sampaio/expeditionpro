import { describe, expect, it } from 'vitest';
import { cents } from '@expedition/domain';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeOpportunityRepository } from './opportunityRepository.fake.js';
import { createOpportunity } from './createOpportunity.js';
import { moveOpportunity } from './moveOpportunity.js';
import { getOpportunityBoard } from './getOpportunityBoard.js';
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
      etapa('s-perda', 'Perdido', 3, 'lost'),
    ],
  });
}

/**
 * OP-03 · OP-04 — a oportunidade exige nome e mais nada.
 *
 * Pedir CPF aqui repetiria no funil o erro que o §3.2 evita no formulário: atrito onde ainda
 * não há compromisso. Quem manda "quanto custa a Coxilha Rica?" não vai parar para digitar
 * documento, e perder esse contato é o que o funil existe para impedir. O CPF é pedido no
 * fechamento (OP-08), que é quando existe compromisso para justificá-lo.
 */
describe('OP-03: criar oportunidade', () => {
  it('nome basta — telefone, e-mail e roteiro são opcionais', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();

    const nova = await createOpportunity({ opportunities, audit }, ctxCom('operator'), {
      contactName: 'Ana Prado',
    });

    expect(nova).toMatchObject({
      contactName: 'Ana Prado',
      stageId: 's-novo',
      source: 'manual',
      phone: null,
      bookingId: null,
    });
  });

  it('nasce na primeira etapa do funil, seja qual for o nome dela', async () => {
    const opportunities = comFunil();
    await opportunities.reorderStages('tenant-a', ['s-conversa', 's-novo', 's-ganho', 's-perda']);
    const audit = fakeAuditLogRepository();

    const nova = await createOpportunity({ opportunities, audit }, ctxCom('operator'), {
      contactName: 'Rui Alves',
    });

    expect(nova.stageId).toBe('s-conversa');
  });

  it('telefone é normalizado na borda, como no resto do sistema', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();

    const nova = await createOpportunity({ opportunities, audit }, ctxCom('operator'), {
      contactName: 'Ana Prado',
      phone: '(48) 99999-8877',
    });

    expect(nova.phone).toBe('5548999998877');
  });

  it('telefone inválido é recusado, não guardado como texto solto', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();

    await expect(
      createOpportunity({ opportunities, audit }, ctxCom('operator'), {
        contactName: 'Ana Prado',
        phone: '123',
      }),
    ).rejects.toThrow();
  });

  it('nome em branco é recusado', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();

    await expect(
      createOpportunity({ opportunities, audit }, ctxCom('operator'), { contactName: '   ' }),
    ).rejects.toThrow();
  });

  it('viewer não cria — é somente leitura em todo o sistema', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();

    await expect(
      createOpportunity({ opportunities, audit }, ctxCom('viewer'), { contactName: 'Ana' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não cria oportunidade — OP-11, o funil é só da equipe', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();

    await expect(
      createOpportunity({ opportunities, audit }, cliente, { contactName: 'Ana' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/**
 * OP-05 · OP-07 — mover cartão, e as duas recusas que sustentam o resto.
 *
 * Mover para uma etapa de **ganho** é recusado de propósito: fechar gera a inscrição (OP-08),
 * e um cartão parado em "Fechado" sem inscrição nenhuma seria uma venda que o financeiro não
 * conhece. Mover para **perda** exige motivo, porque perda sem motivo é dado que não ensina
 * nada depois.
 */
describe('OP-05: mover entre etapas', () => {
  async function comCartao() {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();
    const opp = await createOpportunity({ opportunities, audit }, ctxCom('operator'), {
      contactName: 'Ana Prado',
      expectedValueCents: cents(200000),
    });
    return { opportunities, audit, opp };
  }

  it('operator move — é o trabalho do dia', async () => {
    const { opportunities, audit, opp } = await comCartao();

    const movida = await moveOpportunity({ opportunities, audit }, ctxCom('operator'), {
      opportunityId: opp.id,
      stageId: 's-conversa',
    });

    expect(movida.stageId).toBe('s-conversa');
  });

  it('grava na trilha de onde para onde, com os nomes das etapas', async () => {
    const { opportunities, audit, opp } = await comCartao();

    await moveOpportunity({ opportunities, audit }, ctxCom('operator'), {
      opportunityId: opp.id,
      stageId: 's-conversa',
    });

    const linhas = await audit.listByEntity('tenant-a', 'opportunity', opp.id);
    expect(linhas[0]).toMatchObject({
      actorUserId: 'u1',
      action: 'opportunity.move',
      diff: { stage: { from: 'Novo', to: 'Conversando' } },
    });
  });

  it('mover para a mesma etapa não gera linha na trilha', async () => {
    const { opportunities, audit, opp } = await comCartao();

    await moveOpportunity({ opportunities, audit }, ctxCom('operator'), {
      opportunityId: opp.id,
      stageId: 's-novo',
    });

    // A criação já deixou a própria linha; o que não pode existir é linha de movimento.
    const linhas = await audit.listByEntity('tenant-a', 'opportunity', opp.id);
    expect(linhas.filter((l) => l.action === 'opportunity.move')).toEqual([]);
  });

  it('perder exige motivo', async () => {
    const { opportunities, audit, opp } = await comCartao();

    await expect(
      moveOpportunity({ opportunities, audit }, ctxCom('operator'), {
        opportunityId: opp.id,
        stageId: 's-perda',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('perder com motivo guarda o motivo', async () => {
    const { opportunities, audit, opp } = await comCartao();

    const perdida = await moveOpportunity({ opportunities, audit }, ctxCom('operator'), {
      opportunityId: opp.id,
      stageId: 's-perda',
      lostReason: 'achou caro',
    });

    expect(perdida.lostReason).toBe('achou caro');
  });

  it('mover para ganho é recusado — fechar é OP-08 e gera a inscrição', async () => {
    const { opportunities, audit, opp } = await comCartao();

    try {
      await moveOpportunity({ opportunities, audit }, ctxCom('operator'), {
        opportunityId: opp.id,
        stageId: 's-ganho',
      });
      expect.unreachable('deveria ter recusado');
    } catch (erro) {
      expect(erro).toBeInstanceOf(BusinessRuleError);
      expect((erro as Error).message).toContain('inscrição');
    }
  });

  it('etapa arquivada não recebe cartão', async () => {
    const { opportunities, audit, opp } = await comCartao();
    await opportunities.archiveStage('tenant-a', 's-conversa');

    await expect(
      moveOpportunity({ opportunities, audit }, ctxCom('operator'), {
        opportunityId: opp.id,
        stageId: 's-conversa',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('viewer não move', async () => {
    const { opportunities, audit, opp } = await comCartao();

    await expect(
      moveOpportunity({ opportunities, audit }, ctxCom('viewer'), {
        opportunityId: opp.id,
        stageId: 's-conversa',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/**
 * OP-09 — o quadro devolve etapas e cartões, e **nenhum total de dinheiro do ledger**.
 *
 * O valor previsto vem por cartão e por coluna, sempre rotulado como previsão. Somar isso a
 * valor recebido ou contratado seria misturar aposta com fato — que é exatamente o que o
 * princípio do §1 existe para impedir.
 */
describe('OP-09: o quadro', () => {
  it('agrupa cartões por etapa, na ordem do funil', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();
    const a = await createOpportunity({ opportunities, audit }, ctxCom('operator'), {
      contactName: 'Ana Prado',
      expectedValueCents: cents(200000),
    });
    await moveOpportunity({ opportunities, audit }, ctxCom('operator'), {
      opportunityId: a.id,
      stageId: 's-conversa',
    });
    await createOpportunity({ opportunities, audit }, ctxCom('operator'), {
      contactName: 'Rui Alves',
      expectedValueCents: cents(150000),
    });

    const quadro = await getOpportunityBoard({ opportunities }, ctxCom('viewer'));

    expect(quadro.map((c) => c.stage.name)).toEqual(['Novo', 'Conversando', 'Fechado', 'Perdido']);
    expect(quadro[0]?.opportunities.map((o) => o.contactName)).toEqual(['Rui Alves']);
    expect(quadro[1]?.opportunities.map((o) => o.contactName)).toEqual(['Ana Prado']);
  });

  it('cada coluna traz a soma do previsto — previsão, nunca caixa', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();
    await createOpportunity({ opportunities, audit }, ctxCom('operator'), {
      contactName: 'Ana Prado',
      expectedValueCents: cents(200000),
    });
    await createOpportunity({ opportunities, audit }, ctxCom('operator'), {
      contactName: 'Rui Alves',
      expectedValueCents: cents(150000),
    });

    const quadro = await getOpportunityBoard({ opportunities }, ctxCom('viewer'));

    expect(quadro[0]?.expectedValueCents).toBe(350000);
  });

  it('cartão sem valor previsto não quebra a soma', async () => {
    const opportunities = comFunil();
    const audit = fakeAuditLogRepository();
    await createOpportunity({ opportunities, audit }, ctxCom('operator'), {
      contactName: 'Ana Prado',
    });

    const quadro = await getOpportunityBoard({ opportunities }, ctxCom('viewer'));

    expect(quadro[0]?.expectedValueCents).toBe(0);
  });

  it('cliente não lê o quadro', async () => {
    const opportunities = comFunil();

    await expect(getOpportunityBoard({ opportunities }, cliente)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

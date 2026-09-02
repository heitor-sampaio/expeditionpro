import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { fakeOpportunityRepository } from './opportunityRepository.fake.js';
import { createItinerary } from '../itineraries/createItinerary.js';
import { createOpportunity } from './createOpportunity.js';
import { setOpportunityItinerary } from './setOpportunityItinerary.js';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

function ctxCom(role: 'owner' | 'operator' | 'viewer'): RequestContext {
  return { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u1', role } };
}

const cliente: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u-cli', customerId: 'c1' },
};

/**
 * OP-03 — de qual roteiro é a conversa.
 *
 * É opcional de propósito: metade das conversas começa em "vocês fazem alguma viagem em
 * outubro?", sem roteiro nenhum na cabeça de quem pergunta. Obrigar a escolher no primeiro
 * contato empurraria a equipe a chutar, e chute vira relatório errado depois.
 *
 * O roteiro é o **produto** (Coxilha Rica), não a saída com data — a data raramente existe
 * quando a conversa começa, e o §5.7.2 já registra que o formulário público nem pergunta.
 */
describe('OP-03: roteiro da oportunidade', () => {
  async function comCartao() {
    const opportunities = fakeOpportunityRepository({
      stages: [
        {
          tenantId: 'tenant-a',
          id: 's-novo',
          name: 'Novo',
          position: 0,
          kind: 'open',
          archivedAt: null,
        },
      ],
    });
    const audit = fakeAuditLogRepository();
    const itineraries = fakeItineraryRepository();
    // Pelo caso de uso, não pelo repositório: é o caminho que a aplicação usa, e a
    // fixture não precisa saber o formato interno de `NewItinerary`.
    const coxilha = await createItinerary({ itineraries }, ctxCom('owner'), {
      name: 'Coxilha Rica',
      prices: PRECO,
    });
    const opp = await createOpportunity({ opportunities, audit }, ctxCom('operator'), {
      contactName: 'Ana Prado',
    });
    return { opportunities, audit, itineraries, opp, coxilha };
  }

  it('define o roteiro de uma oportunidade que não tinha', async () => {
    const { opportunities, audit, itineraries, opp, coxilha } = await comCartao();

    const atualizada = await setOpportunityItinerary(
      { opportunities, audit, itineraries },
      ctxCom('operator'),
      { opportunityId: opp.id, itineraryId: coxilha.id },
    );

    expect(atualizada.itineraryId).toBe(coxilha.id);
  });

  it('grava na trilha o nome do roteiro, não o id — quem lê depois quer o nome', async () => {
    const { opportunities, audit, itineraries, opp, coxilha } = await comCartao();

    await setOpportunityItinerary({ opportunities, audit, itineraries }, ctxCom('operator'), {
      opportunityId: opp.id,
      itineraryId: coxilha.id,
    });

    const linhas = await audit.listByEntity('tenant-a', 'opportunity', opp.id);
    expect(linhas.find((l) => l.action === 'opportunity.set_itinerary')).toMatchObject({
      diff: { itinerary: { from: null, to: 'Coxilha Rica' } },
    });
  });

  it('limpar o roteiro é permitido — a conversa pode ter mudado de assunto', async () => {
    const { opportunities, audit, itineraries, opp, coxilha } = await comCartao();
    await setOpportunityItinerary({ opportunities, audit, itineraries }, ctxCom('operator'), {
      opportunityId: opp.id,
      itineraryId: coxilha.id,
    });

    const limpa = await setOpportunityItinerary(
      { opportunities, audit, itineraries },
      ctxCom('operator'),
      { opportunityId: opp.id, itineraryId: null },
    );

    expect(limpa.itineraryId).toBeNull();
  });

  it('roteiro de outro tenant responde como se não existisse', async () => {
    const { opportunities, audit, itineraries, opp } = await comCartao();

    await expect(
      setOpportunityItinerary({ opportunities, audit, itineraries }, ctxCom('operator'), {
        opportunityId: opp.id,
        itineraryId: 'de-outro-tenant',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('oportunidade que virou inscrição não muda mais de roteiro', async () => {
    const { opportunities, audit, itineraries, opp, coxilha } = await comCartao();
    await opportunities.updateOpportunity('tenant-a', opp.id, { bookingId: 'bk-1' });

    await expect(
      setOpportunityItinerary({ opportunities, audit, itineraries }, ctxCom('operator'), {
        opportunityId: opp.id,
        itineraryId: coxilha.id,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('viewer não muda', async () => {
    const { opportunities, audit, itineraries, opp, coxilha } = await comCartao();

    await expect(
      setOpportunityItinerary({ opportunities, audit, itineraries }, ctxCom('viewer'), {
        opportunityId: opp.id,
        itineraryId: coxilha.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não chega aqui', async () => {
    const { opportunities, audit, itineraries, opp, coxilha } = await comCartao();

    await expect(
      setOpportunityItinerary({ opportunities, audit, itineraries }, cliente, {
        opportunityId: opp.id,
        itineraryId: coxilha.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

const PRECO = {
  validFrom: '2026-01-01',
  coupleCents: 200000,
  soloCents: 120000,
  extraAdultCents: 80000,
  childMidCents: 60000,
  childYoungCents: 40000,
};

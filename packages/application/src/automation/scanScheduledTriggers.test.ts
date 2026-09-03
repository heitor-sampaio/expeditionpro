import { describe, expect, it, vi } from 'vitest';
import { parseLocalDate } from '@expedition/domain';
import { fakeAutomationRepository } from './automationRepository.fake.js';
import {
  fakeAutomationRunRepository,
  fakeAutomationRunStepRepository,
} from './automationRunRepository.fake.js';
import { fakeMembershipRepository } from '../team/membershipRepository.fake.js';
import { scanScheduledTriggers } from './scanScheduledTriggers.js';
import type { ScheduleEventWithGroup } from '../schedule/scheduleRepository.js';

/**
 * AU-12 — o gatilho temporal.
 *
 * É varrido, e não agendado. Despertador perde o disparo quando o processo está fora do ar
 * às 9:00; "quais saídas começam em três dias?" continua verdadeiro quando ele volta às 9:05,
 * e às 11:00 do dia seguinte também. O preço de varrer é passar de novo pela mesma saída — e
 * é a **chave única**, não a precisão do relógio, que garante uma execução só.
 *
 * A data entra como parâmetro. Varredura que lê o relógio por dentro só dá para testar
 * esperando o dia virar.
 */

const HOJE = parseLocalDate('2026-09-03');

function evento(id: string, inicio: string): ScheduleEventWithGroup {
  return {
    event: {
      id,
      tenantId: 't1',
      itineraryId: 'i1',
      startDate: parseLocalDate(inicio),
      endDate: parseLocalDate(inicio),
      title: null,
      notes: null,
      status: 'scheduled',
    },
    group: {
      id: `grupo-${id}`,
      tenantId: 't1',
      itineraryId: 'i1',
      scheduleEventId: id,
      name: `Saída ${id}`,
      status: 'open',
      capacityVehicles: null,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  };
}

function deps(eventos: ScheduleEventWithGroup[]) {
  const automations = fakeAutomationRepository();
  return {
    automations,
    runs: fakeAutomationRunRepository(),
    steps: fakeAutomationRunStepRepository(),
    memberships: fakeMembershipRepository(),
    actions: {},
    schedule: { listEvents: vi.fn().mockResolvedValue(eventos) },
  };
}

type Deps = ReturnType<typeof deps>;

async function comAutomacaoTemporal(d: Deps, offsetDays: number) {
  const criada = await d.automations.create({
    tenantId: 't1',
    name: 'Lembrar três dias antes',
    description: null,
    triggerType: 'scheduled',
    triggerConfig: { offsetDays },
    graph: { nodes: [], edges: [] },
    createdBy: 'u-ana',
  });
  await d.automations.update('t1', criada.id, {
    enabled: true,
    runAsUserId: 'u-ana',
    triggerConfig: { offsetDays },
  });
  return criada;
}

describe('AU-12: a varredura temporal', () => {
  it('enfileira a saída que começa daqui a três dias', async () => {
    const d = deps([evento('e1', '2026-09-06')]);
    await comAutomacaoTemporal(d, -3);

    const abertas = await scanScheduledTriggers(d, { today: HOJE, now: new Date() });

    expect(abertas).toBe(1);
    expect(d.runs.rows[0]?.triggerRef).toMatchObject({ scheduleEventId: 'e1' });
  });

  it('ignora a saída que começa em outro dia', async () => {
    const d = deps([evento('e1', '2026-09-10')]);
    await comAutomacaoTemporal(d, -3);

    expect(await scanScheduledTriggers(d, { today: HOJE, now: new Date() })).toBe(0);
  });

  /** Deslocamento positivo é depois da saída: pesquisa de satisfação, por exemplo. */
  it('deslocamento positivo pega a saída que já aconteceu', async () => {
    const d = deps([evento('e1', '2026-09-01')]);
    await comAutomacaoTemporal(d, 2);

    expect(await scanScheduledTriggers(d, { today: HOJE, now: new Date() })).toBe(1);
  });

  /**
   * A regra que faz a varredura ser segura: passar duas vezes no mesmo dia não manda duas
   * mensagens. Sem isso, um reinício do processo viraria mensagem repetida para o cliente.
   */
  it('passar de novo no mesmo dia não abre execução duas vezes', async () => {
    const d = deps([evento('e1', '2026-09-06')]);
    await comAutomacaoTemporal(d, -3);

    await scanScheduledTriggers(d, { today: HOJE, now: new Date() });
    const segunda = await scanScheduledTriggers(d, { today: HOJE, now: new Date() });

    expect(segunda).toBe(0);
    expect(d.runs.rows).toHaveLength(1);
  });

  it('a varredura não olha automação desligada', async () => {
    const d = deps([evento('e1', '2026-09-06')]);
    const criada = await comAutomacaoTemporal(d, -3);
    await d.automations.update('t1', criada.id, { enabled: false });

    expect(await scanScheduledTriggers(d, { today: HOJE, now: new Date() })).toBe(0);
  });

  it('sem automação temporal ligada, a varredura não olha a agenda de ninguém', async () => {
    const d = deps([evento('e1', '2026-09-06')]);

    await scanScheduledTriggers(d, { today: HOJE, now: new Date() });

    expect(d.schedule.listEvents).not.toHaveBeenCalled();
  });
});

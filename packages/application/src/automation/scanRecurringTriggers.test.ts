import { describe, expect, it } from 'vitest';
import { fakeAutomationRepository } from './automationRepository.fake.js';
import {
  fakeAutomationRunRepository,
  fakeAutomationRunStepRepository,
} from './automationRunRepository.fake.js';
import { fakeMembershipRepository } from '../team/membershipRepository.fake.js';
import { scanRecurringTriggers } from './scanRecurringTriggers.js';

/**
 * AU-17 — o gatilho de tempo em tempo.
 *
 * O que se cobra aqui é o contrário do que parece: não é que ele **dispare**, é que ele
 * dispare **uma vez** por intervalo. A varredura passa de sessenta em sessenta segundos, e
 * sem a fatia de tempo virando chave de idempotência "a cada seis horas" viraria "a cada
 * minuto" — trezentas e sessenta mensagens por dia para o mesmo cliente.
 *
 * O relógio entra como parâmetro. Varredura que lê `new Date()` por dentro não dá para provar
 * num intervalo de seis horas.
 */

const AGORA = new Date('2026-09-03T12:00:00.000Z');

function deps() {
  return {
    automations: fakeAutomationRepository(),
    runs: fakeAutomationRunRepository(),
    steps: fakeAutomationRunStepRepository(),
    memberships: fakeMembershipRepository(),
    actions: {},
    finders: {},
  };
}

type Deps = ReturnType<typeof deps>;

async function comRecorrente(d: Deps, config: Record<string, unknown>, tenantId = 't1') {
  const criada = await d.automations.create({
    tenantId,
    name: `A cada tanto ${tenantId}`,
    description: null,
    graph: { nodes: [], edges: [] },
    createdBy: 'u-ana',
  });
  await d.automations.update(tenantId, criada.id, {
    enabled: true,
    runAsUserId: 'u-ana',
    triggerType: 'recurring',
    triggerConfig: config,
  });
  return criada;
}

describe('AU-17: a varredura de tempo em tempo', () => {
  it('abre execução na primeira passada', async () => {
    const d = deps();
    await comRecorrente(d, { amount: 6, unit: 'hours' });

    expect(await scanRecurringTriggers(d, { now: AGORA })).toBe(1);
    expect(d.runs.rows).toHaveLength(1);
  });

  /** A prova que sustenta o desenho inteiro: varrer de minuto em minuto não multiplica nada. */
  it('não abre de novo dentro do mesmo intervalo', async () => {
    const d = deps();
    await comRecorrente(d, { amount: 6, unit: 'hours' });

    await scanRecurringTriggers(d, { now: AGORA });
    const segunda = await scanRecurringTriggers(d, {
      now: new Date(AGORA.getTime() + 60_000),
    });

    expect(segunda).toBe(0);
    expect(d.runs.rows).toHaveLength(1);
  });

  it('abre de novo quando o intervalo vira', async () => {
    const d = deps();
    await comRecorrente(d, { amount: 6, unit: 'hours' });

    await scanRecurringTriggers(d, { now: AGORA });
    await scanRecurringTriggers(d, { now: new Date('2026-09-03T18:00:00.000Z') });

    expect(d.runs.rows).toHaveLength(2);
  });

  it('automação desligada não é varrida', async () => {
    const d = deps();
    const criada = await comRecorrente(d, { amount: 1, unit: 'hours' });
    await d.automations.update('t1', criada.id, { enabled: false });

    expect(await scanRecurringTriggers(d, { now: AGORA })).toBe(0);
  });

  /**
   * O contexto do gatilho de tempo é o relógio, e é o que AU-16 promete na tela. A hora é a
   * **da operação**, não a do servidor: meio-dia em UTC é nove da manhã para quem lê.
   */
  it('a execução nasce com a data e a hora no fuso da operação', async () => {
    const d = deps();
    await comRecorrente(d, { amount: 1, unit: 'hours' });

    await scanRecurringTriggers(d, { now: AGORA });

    expect(d.runs.rows[0]?.variables).toEqual({
      agora: { data: '2026-09-03', hora: '09:00' },
    });
  });

  /** Cada tenant tem a fatia dele: a chave de idempotência é por automação, não global. */
  it('varre os tenants que têm automação de tempo ligada', async () => {
    const d = deps();
    await comRecorrente(d, { amount: 1, unit: 'hours' }, 't1');
    await comRecorrente(d, { amount: 1, unit: 'hours' }, 't2');

    expect(await scanRecurringTriggers(d, { now: AGORA })).toBe(2);
  });

  it('sem automação de tempo ligada, não faz nada', async () => {
    expect(await scanRecurringTriggers(deps(), { now: AGORA })).toBe(0);
  });
});

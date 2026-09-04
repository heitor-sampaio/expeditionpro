import { describe, expect, it, vi } from 'vitest';
import { fakeAutomationRepository } from './automationRepository.fake.js';
import {
  fakeAutomationRunRepository,
  fakeAutomationRunStepRepository,
} from './automationRunRepository.fake.js';
import { fakeMembershipRepository } from '../team/membershipRepository.fake.js';
import { enqueueAutomationRun } from './enqueueAutomationRun.js';
import { advanceAutomationRun, TETO_DE_PASSOS } from './advanceAutomationRun.js';
import { TETO_DA_BUSCA } from './seedRunsFromList.js';
import { resumeDueRuns } from './resumeDueRuns.js';
import { simulateAutomationRun } from './simulateAutomationRun.js';
import type { AutomationActions } from './automationActions.js';
import type { AutomationFinders } from './automationFinders.js';
import type { AutomationGraph } from '@expedition/domain';

/**
 * AU-03 · AU-04 · AU-05 · AU-06 · AU-11 — o motor.
 *
 * O interpretador é a peça que roda **sem ninguém olhando**, sobre gente de verdade. Por isso
 * o que se cobra aqui não é o caminho feliz: é o teto de passos (senão um fluxo torto anda para
 * sempre), o papel relido (senão quem foi desligado continua agindo por procuração), a
 * reivindicação (senão dois relógios mandam a mesma mensagem duas vezes) e o log (senão
 * ninguém consegue responder por que aquela mensagem saiu).
 *
 * O relógio entra como parâmetro em tudo. Motor que lê `new Date()` por dentro é motor que não
 * dá para testar em espera de três dias.
 */

const AGORA = new Date('2026-09-03T12:00:00.000Z');

function grafo(...blocos: { id: string; kind: string; type: string; config?: object }[]) {
  const nodes = blocos.map((b, i) => ({
    id: b.id,
    kind: b.kind,
    type: b.type,
    config: b.config ?? {},
    position: { x: 0, y: i * 100 },
  }));
  const edges = blocos.slice(0, -1).map((b, i) => ({
    id: `e${i}`,
    from: b.id,
    port: 'next' as const,
    to: blocos[i + 1]!.id,
  }));
  return { nodes, edges } as AutomationGraph;
}

const SIMPLES = grafo(
  { id: 'g1', kind: 'trigger', type: 'message_received' },
  { id: 'a1', kind: 'action', type: 'send_message', config: { text: 'Oi {{contato.nome}}!' } },
  { id: 'f1', kind: 'end', type: 'end' },
);

function deps(actions: AutomationActions = {}) {
  return {
    automations: fakeAutomationRepository(),
    runs: fakeAutomationRunRepository(),
    steps: fakeAutomationRunStepRepository(),
    memberships: fakeMembershipRepository(),
    actions,
    // AU-18: as buscas entram por teste, como as ações — o motor não conhece conversa nenhuma.
    finders: {} as AutomationFinders,
  };
}

type Deps = ReturnType<typeof deps>;

/**
 * Uma automação ligada, com o papel de quem a ligou já registrado.
 *
 * AU-14: o gatilho da linha vem do bloco do desenho — aqui pelo mesmo caminho da vida real,
 * o salvamento, para a fixture não inventar uma combinação que o sistema não produz.
 */
async function ligada(d: Deps, graph: AutomationGraph = SIMPLES) {
  const criada = await d.automations.create({
    tenantId: 't1',
    name: 'Responder preço',
    description: null,
    graph,
    createdBy: 'u-ana',
  });
  const gatilho = graph.nodes.find((no) => no.kind === 'trigger');
  await d.automations.update('t1', criada.id, {
    enabled: true,
    runAsUserId: 'u-ana',
    triggerType: (gatilho?.type ?? null) as 'message_received' | null,
    triggerConfig: gatilho?.config ?? {},
  });
  await d.memberships.grant('t1', 'u-ana', 'ana@drakkar.com.br', 'admin');
  return criada;
}

async function enfileirarUma(d: Deps) {
  return enqueueAutomationRun(d, {
    tenantId: 't1',
    triggerType: 'message_received',
    triggerRef: { conversationId: 'c1' },
    variables: { contato: { nome: 'Ana' }, mensagem: { texto: 'quanto custa?' } },
    now: AGORA,
  });
}

describe('AU-04: o gatilho enfileira', () => {
  it('abre uma execução para cada automação ligada daquele gatilho', async () => {
    const d = deps();
    await ligada(d);

    const abertas = await enfileirarUma(d);

    expect(abertas).toHaveLength(1);
    expect(d.runs.rows[0]).toMatchObject({ status: 'pending', wakeAt: AGORA });
  });

  /** Desligada é desligada: o gatilho passa por ela e não abre nada. */
  it('automação desligada não abre execução', async () => {
    const d = deps();
    const criada = await ligada(d);
    await d.automations.update('t1', criada.id, { enabled: false });

    expect(await enfileirarUma(d)).toHaveLength(0);
  });

  it('gatilho de outro tipo não acorda esta automação', async () => {
    const d = deps();
    await ligada(d);

    const abertas = await enqueueAutomationRun(d, {
      tenantId: 't1',
      triggerType: 'payment_registered',
      triggerRef: {},
      variables: {},
      now: AGORA,
    });

    expect(abertas).toHaveLength(0);
  });

  it('automação de outro tenant não é acordada', async () => {
    const d = deps();
    await ligada(d);

    const abertas = await enqueueAutomationRun(d, {
      tenantId: 't2',
      triggerType: 'message_received',
      triggerRef: {},
      variables: {},
      now: AGORA,
    });

    expect(abertas).toHaveLength(0);
  });

  /**
   * AU-12: a varredura temporal passa de novo pela mesma saída. É a chave única que impede o
   * segundo disparo — não a precisão do relógio.
   */
  it('a mesma chave de idempotência não abre execução duas vezes', async () => {
    const d = deps();
    await ligada(d);
    const comando = {
      tenantId: 't1',
      triggerType: 'message_received' as const,
      triggerRef: { groupId: 'g9' },
      variables: {},
      idempotencyKey: 'g9:3d',
      now: AGORA,
    };

    await enqueueAutomationRun(d, comando);
    const segunda = await enqueueAutomationRun(d, comando);

    expect(segunda).toHaveLength(0);
    expect(d.runs.rows).toHaveLength(1);
  });
});

describe('AU-04 · AU-06: o motor anda pelo grafo', () => {
  it('executa a ação e termina a execução', async () => {
    const enviar = vi.fn().mockResolvedValue({ messageId: 'm1' });
    const d = deps({ send_message: enviar });
    const automacao = await ligada(d);
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(enviar).toHaveBeenCalledOnce();
    expect(d.runs.rows[0]?.status).toBe('done');
    expect(automacao.id).toBeDefined();
  });

  /** AU-09: a variável do contexto entra no texto antes de a ação ver a configuração. */
  it('o texto da ação chega com as variáveis já trocadas', async () => {
    const enviar = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: enviar });
    await ligada(d);
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(enviar.mock.calls[0]?.[0].config).toMatchObject({ text: 'Oi Ana!' });
  });

  /** AU-03: o motor age como a pessoa que ligou, com o papel que ela tem **agora**. */
  it('a ação recebe o contexto de quem ligou a automação', async () => {
    const enviar = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: enviar });
    await ligada(d);
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(enviar.mock.calls[0]?.[0].ctx).toEqual({
      tenantId: 't1',
      actor: { kind: 'team', userId: 'u-ana', role: 'admin' },
    });
  });

  it('a condição escolhe o caminho, e o log diz qual foi', async () => {
    const sim = vi.fn().mockResolvedValue({});
    const nao = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: sim, notify_team: nao });
    await ligada(d, {
      nodes: [
        {
          id: 'g1',
          kind: 'trigger',
          type: 'message_received',
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: 'c1',
          kind: 'condition',
          type: 'field',
          config: { field: 'mensagem.texto', operator: 'contains', value: 'custa' },
          position: { x: 0, y: 60 },
        },
        { id: 'a1', kind: 'action', type: 'send_message', config: {}, position: { x: 0, y: 120 } },
        { id: 'a2', kind: 'action', type: 'notify_team', config: {}, position: { x: 90, y: 120 } },
      ],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'c1' },
        { id: 'e2', from: 'c1', port: 'true', to: 'a1' },
        { id: 'e3', from: 'c1', port: 'false', to: 'a2' },
      ],
    });
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(sim).toHaveBeenCalledOnce();
    expect(nao).not.toHaveBeenCalled();
    expect(d.steps.rows.find((s) => s.nodeId === 'c1')?.outcome).toBe('true');
  });

  it('a variável definida no fluxo vale nos blocos seguintes', async () => {
    const enviar = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: enviar });
    await ligada(
      d,
      grafo(
        { id: 'g1', kind: 'trigger', type: 'message_received' },
        {
          id: 'v1',
          kind: 'setVariable',
          type: 'set',
          config: { name: 'saudacao', value: 'Boa tarde' },
        },
        {
          id: 'a1',
          kind: 'action',
          type: 'send_message',
          config: { text: '{{saudacao}}, {{contato.nome}}' },
        },
      ),
    );
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(enviar.mock.calls[0]?.[0].config).toMatchObject({ text: 'Boa tarde, Ana' });
  });

  it('todo nó por onde passou deixa um passo no log', async () => {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    await ligada(d);
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(d.steps.rows.map((s) => s.nodeId)).toEqual(['g1', 'a1', 'f1']);
  });
});

describe('AU-07: a espera adormece a execução', () => {
  const COM_ESPERA = grafo(
    { id: 'g1', kind: 'trigger', type: 'message_received' },
    { id: 'w1', kind: 'delay', type: 'wait', config: { amount: 2, unit: 'days' } },
    { id: 'a1', kind: 'action', type: 'send_message', config: { text: 'oi' } },
  );

  it('para na espera, guarda quando acordar e não executa o que vem depois', async () => {
    const enviar = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: enviar });
    await ligada(d, COM_ESPERA);
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(enviar).not.toHaveBeenCalled();
    expect(d.runs.rows[0]).toMatchObject({ status: 'waiting', currentNodeId: 'a1' });
    expect(d.runs.rows[0]?.wakeAt.toISOString()).toBe('2026-09-05T12:00:00.000Z');
  });

  /** Retomar é continuar de onde parou — nunca refazer o que já rodou. */
  it('ao acordar, continua do bloco seguinte', async () => {
    const enviar = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: enviar });
    await ligada(d, COM_ESPERA);
    await enfileirarUma(d);
    await advanceAutomationRun(d, ref(d), AGORA);

    const depois = new Date('2026-09-05T12:00:01.000Z');
    await advanceAutomationRun(d, ref(d), depois);

    expect(enviar).toHaveBeenCalledOnce();
    expect(d.runs.rows[0]?.status).toBe('done');
  });
});

describe('AU-05 · AU-11: o que impede o estrago', () => {
  /**
   * O ciclo com espera é legítimo e o grafo o aceita — mas um fluxo longo demais ainda é um
   * fluxo que anda sozinho. O teto de passos é o freio final.
   */
  it('a execução para no teto de passos, com o motivo guardado', async () => {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    const nodes = Array.from({ length: TETO_DE_PASSOS + 5 }, (_, i) => ({
      id: `n${i}`,
      kind: i === 0 ? 'trigger' : 'action',
      type: i === 0 ? 'message_received' : 'send_message',
      config: {},
      position: { x: 0, y: i * 40 },
    }));
    const edges = nodes.slice(0, -1).map((n, i) => ({
      id: `e${i}`,
      from: n.id,
      port: 'next' as const,
      to: nodes[i + 1]!.id,
    }));
    await ligada(d, { nodes, edges } as AutomationGraph);
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(d.runs.rows[0]?.status).toBe('failed');
    expect(d.runs.rows[0]?.lastError).toContain('passos');
  });

  /**
   * AU-03 — o teto de poder de uma automação é o teto de quem a ligou. Quem perdeu acesso não
   * age por procuração: a execução falha dizendo isso, em vez de agir com poder que não existe.
   */
  it('automação de quem perdeu acesso falha com motivo, e não age', async () => {
    const enviar = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: enviar });
    await ligada(d);
    await d.memberships.revoke('t1', 'u-ana');
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(enviar).not.toHaveBeenCalled();
    expect(d.runs.rows[0]?.status).toBe('failed');
    expect(d.runs.rows[0]?.lastError).toContain('acesso');
  });

  it('automação desligada no meio da espera é cancelada em vez de continuar', async () => {
    const enviar = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: enviar });
    const automacao = await ligada(d);
    await enfileirarUma(d);
    await d.automations.update('t1', automacao.id, { enabled: false });

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(enviar).not.toHaveBeenCalled();
    expect(d.runs.rows[0]?.status).toBe('cancelled');
  });

  /** AU-11: falha de provedor tenta de novo, mas não para sempre. */
  it('falha da ação volta para a fila e conta a tentativa', async () => {
    const enviar = vi.fn().mockRejectedValue(new Error('provedor fora do ar'));
    const d = deps({ send_message: enviar });
    await ligada(d);
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(d.runs.rows[0]).toMatchObject({ status: 'pending', attempts: 1 });
    expect(d.runs.rows[0]?.wakeAt.getTime()).toBeGreaterThan(AGORA.getTime());
    expect(d.steps.rows.at(-1)?.outcome).toBe('erro');
  });

  it('esgotadas as tentativas, a execução falha e para de tentar', async () => {
    const enviar = vi.fn().mockRejectedValue(new Error('provedor fora do ar'));
    const d = deps({ send_message: enviar });
    await ligada(d);
    await enfileirarUma(d);

    for (let i = 0; i < 5; i += 1) {
      await advanceAutomationRun(d, ref(d), new Date(AGORA.getTime() + i * 3_600_000));
    }

    expect(d.runs.rows[0]?.status).toBe('failed');
    expect(d.runs.rows[0]?.lastError).toContain('provedor fora do ar');
  });

  /** Ação que o registro não conhece falha a execução em vez de sumir em silêncio. */
  it('ação desconhecida falha com motivo legível', async () => {
    const d = deps({});
    await ligada(d);
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(d.runs.rows[0]?.status).toBe('failed');
    expect(d.runs.rows[0]?.lastError).toContain('send_message');
  });
});

describe('AU-04: o relógio retoma o que está vencido', () => {
  it('retoma a execução vencida e não a que ainda dorme', async () => {
    const enviar = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: enviar });
    await ligada(d);
    await enfileirarUma(d);
    await d.runs.enqueue({
      tenantId: 't1',
      automationId: d.automations.rows[0]!.id,
      triggerRef: {},
      idempotencyKey: null,
      variables: {},
      wakeAt: new Date('2026-09-10T00:00:00.000Z'),
    });

    const feitas = await resumeDueRuns(d, { workerId: 'w1', now: AGORA, limit: 10 });

    expect(feitas).toBe(1);
    expect(enviar).toHaveBeenCalledOnce();
  });

  /**
   * Dois processos da API rodam o mesmo laço. Sem reivindicação, os dois pegam a mesma
   * execução e o cliente recebe a mesma mensagem duas vezes.
   */
  it('dois relógios não pegam a mesma execução', async () => {
    const enviar = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: enviar });
    await ligada(d);
    await enfileirarUma(d);

    const [a, b] = await Promise.all([
      resumeDueRuns(d, { workerId: 'w1', now: AGORA, limit: 10 }),
      resumeDueRuns(d, { workerId: 'w2', now: AGORA, limit: 10 }),
    ]);

    expect(a + b).toBe(1);
    expect(enviar).toHaveBeenCalledOnce();
  });

  it('não passa do lote pedido — 200 saídas viram fila, não 200 mensagens de uma vez', async () => {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    await ligada(d);
    for (let i = 0; i < 8; i += 1) await enfileirarUma(d);

    expect(await resumeDueRuns(d, { workerId: 'w1', now: AGORA, limit: 3 })).toBe(3);
  });
});

/** A execução mais recente, no formato que o relógio entrega ao interpretador. */
function ref(d: Deps) {
  const row = d.runs.rows[0]!;
  return { id: row.id, tenantId: row.tenantId, automationId: row.automationId };
}

/**
 * AU-15 — a escolha múltipla no motor.
 *
 * A alternativa que ela substitui é uma escada de condições encadeadas, e escada de condição é
 * onde se troca o lado do "sim" sem perceber. Aqui a prova é dupla: sai pelo caminho do valor
 * que casou, e o log guarda **qual** foi — sem isso, "por que esse cliente recebeu a mensagem
 * do roteiro errado?" não tem resposta.
 */
describe('AU-15: a escolha múltipla desvia por valor', () => {
  const comEscolha = (): AutomationGraph => ({
    nodes: [
      { id: 'g1', kind: 'trigger', type: 'message_received', config: {}, position: { x: 0, y: 0 } },
      {
        id: 's1',
        kind: 'switch',
        type: 'match',
        config: {
          field: 'mensagem.texto',
          cases: [
            { id: 'c1', value: 'custa' },
            { id: 'c2', value: 'data' },
          ],
        },
        position: { x: 0, y: 60 },
      },
      { id: 'a1', kind: 'action', type: 'send_message', config: {}, position: { x: 0, y: 120 } },
      { id: 'a2', kind: 'action', type: 'notify_team', config: {}, position: { x: 90, y: 120 } },
      { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 180, y: 120 } },
    ],
    edges: [
      { id: 'e1', from: 'g1', port: 'next', to: 's1' },
      { id: 'e2', from: 's1', port: 'case_c1', to: 'a1' },
      { id: 'e3', from: 's1', port: 'case_c2', to: 'a2' },
      { id: 'e4', from: 's1', port: 'default', to: 'f1' },
    ],
  });

  async function rodarCom(texto: string) {
    const preco = vi.fn().mockResolvedValue({});
    const data = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: preco, notify_team: data });
    await ligada(d, comEscolha());
    await enqueueAutomationRun(d, {
      tenantId: 't1',
      triggerType: 'message_received',
      triggerRef: { conversationId: 'c1' },
      variables: { mensagem: { texto } },
      now: AGORA,
    });

    await advanceAutomationRun(d, ref(d), AGORA);

    return { d, preco, data };
  }

  it('vai pelo caminho do valor que casou, e o log diz qual foi', async () => {
    const { d, preco, data } = await rodarCom('quanto custa?');

    expect(preco).toHaveBeenCalledOnce();
    expect(data).not.toHaveBeenCalled();
    expect(d.steps.rows.find((s) => s.nodeId === 's1')?.outcome).toBe('case_c1');
  });

  it('o segundo valor tem o caminho dele', async () => {
    const { preco, data } = await rodarCom('qual a data da saída?');

    expect(data).toHaveBeenCalledOnce();
    expect(preco).not.toHaveBeenCalled();
  });

  /** O que não casa com nada segue pelo padrão e termina — nunca fica parado no meio. */
  it('o que não casa com nada vai pelo padrão', async () => {
    const { d, preco, data } = await rodarCom('bom dia!');

    expect(preco).not.toHaveBeenCalled();
    expect(data).not.toHaveBeenCalled();
    expect(d.steps.rows.find((s) => s.nodeId === 's1')?.outcome).toBe('default');
    expect(d.runs.rows[0]?.status).toBe('done');
  });
});

/**
 * AU-19 — buscar um item e trazê-lo para o contexto.
 *
 * O caso que pediu: "o lead mandou mensagem; se não existe cartão dele no funil, crie". O
 * gatilho traz conversa e contato, e nada do funil — a busca é quem vai ver, e o resultado dela
 * fica no contexto para o resto do fluxo usar.
 *
 * Duas saídas, como a condição. "Não achou" é onde mora o "então crie", e um bloco que só
 * tivesse "achou" obrigaria a inverter o fluxo inteiro para dizer a coisa mais simples.
 */
describe('AU-19: buscar um item', () => {
  const comLookup = (): AutomationGraph => ({
    nodes: [
      {
        id: 'g1',
        kind: 'trigger',
        type: 'message_received',
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: 'b1',
        kind: 'lookup',
        type: 'find_one',
        config: { entity: 'opportunities', filters: [] },
        position: { x: 0, y: 60 },
      },
      { id: 'a1', kind: 'action', type: 'send_message', config: {}, position: { x: 0, y: 120 } },
      {
        id: 'a2',
        kind: 'action',
        type: 'create_opportunity',
        config: {},
        position: { x: 120, y: 120 },
      },
    ],
    edges: [
      { id: 'e1', from: 'g1', port: 'next', to: 'b1' },
      { id: 'e2', from: 'b1', port: 'true', to: 'a1' },
      { id: 'e3', from: 'b1', port: 'false', to: 'a2' },
    ],
  });

  async function rodarCom(achados: { key: string; variables: Record<string, unknown> }[]) {
    const achou = vi.fn().mockResolvedValue({});
    const naoAchou = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: achou, create_opportunity: naoAchou });
    d.finders = { find_one: vi.fn().mockResolvedValue(achados) };
    await ligada(d, comLookup());
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    return { d, achou, naoAchou };
  }

  it('achando, segue pelo caminho de achou', async () => {
    const { achou, naoAchou } = await rodarCom([
      { key: 'op-1', variables: { oportunidade: { id: 'op-1', etapa: 'Em conversa' } } },
    ]);

    expect(achou).toHaveBeenCalledOnce();
    expect(naoAchou).not.toHaveBeenCalled();
  });

  it('o item achado entra no contexto, e o resto do fluxo o enxerga', async () => {
    const { d } = await rodarCom([
      { key: 'op-1', variables: { oportunidade: { id: 'op-1', etapa: 'Em conversa' } } },
    ]);

    expect(d.runs.rows[0]?.variables).toMatchObject({
      oportunidade: { id: 'op-1', etapa: 'Em conversa' },
      contato: { nome: 'Ana' },
    });
  });

  /** O caminho que o pedido queria: não achou nada, então cria. */
  it('sem achado, segue pelo caminho de não achou', async () => {
    const { achou, naoAchou } = await rodarCom([]);

    expect(naoAchou).toHaveBeenCalledOnce();
    expect(achou).not.toHaveBeenCalled();
  });

  it('o log guarda por onde saiu', async () => {
    const { d } = await rodarCom([]);

    expect(d.runs.rows[0]?.status).toBe('done');
    expect(d.steps.rows.find((s) => s.nodeId === 'b1')?.outcome).toBe('false');
  });

  /** Achando mais de um, o primeiro ganha: "um item" é a promessa que o bloco faz na tela. */
  it('com vários achados, o primeiro entra no contexto', async () => {
    const { d } = await rodarCom([
      { key: 'op-1', variables: { oportunidade: { id: 'op-1' } } },
      { key: 'op-2', variables: { oportunidade: { id: 'op-2' } } },
    ]);

    expect(d.runs.rows[0]?.variables).toMatchObject({ oportunidade: { id: 'op-1' } });
  });

  it('busca desconhecida falha com o nome dela no motivo', async () => {
    const d = deps();
    d.finders = {};
    await ligada(d, comLookup());
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(d.runs.rows[0]).toMatchObject({
      status: 'failed',
      lastError: expect.stringContaining('find_one'),
    });
  });
});

/**
 * AU-20 — buscar todos e iterar são dois blocos, e não um.
 *
 * O "para cada" deixou de buscar por conta própria: agora ele percorre a lista que uma busca
 * guardou no contexto. Separar as duas coisas é o que permite olhar o resultado antes de agir —
 * contar, condicionar, avisar a equipe se veio vazio — em vez de semear às cegas.
 */
describe('AU-20: buscar todos, e depois percorrer', () => {
  const comBuscaEIteracao = (): AutomationGraph => ({
    nodes: [
      { id: 'g1', kind: 'trigger', type: 'recurring', config: {}, position: { x: 0, y: 0 } },
      {
        id: 'b1',
        kind: 'lookup',
        type: 'find_one',
        config: { entity: 'customers', filters: [], mode: 'all', as: 'clientes' },
        position: { x: 0, y: 60 },
      },
      {
        id: 'p1',
        kind: 'forEach',
        type: 'for_each',
        config: { list: 'clientes', limit: 10 },
        position: { x: 0, y: 120 },
      },
      { id: 'a1', kind: 'action', type: 'send_message', config: {}, position: { x: 0, y: 180 } },
      { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 120, y: 120 } },
    ],
    edges: [
      { id: 'e1', from: 'g1', port: 'next', to: 'b1' },
      { id: 'e2', from: 'b1', port: 'true', to: 'p1' },
      { id: 'e3', from: 'b1', port: 'false', to: 'f1' },
      { id: 'e4', from: 'p1', port: 'next', to: 'a1' },
    ],
  });

  async function rodar(achados: { key: string; variables: Record<string, unknown> }[]) {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    d.finders = { find_one: vi.fn().mockResolvedValue(achados) };
    await ligada(d, comBuscaEIteracao());
    await enqueueAutomationRun(d, {
      tenantId: 't1',
      triggerType: 'recurring',
      triggerRef: {},
      variables: {},
      now: AGORA,
    });
    await advanceAutomationRun(d, ref(d), AGORA);
    return d;
  }

  it('a busca em modo todos guarda a lista com o nome escolhido', async () => {
    const d = await rodar([
      { key: 'c1', variables: { cliente: { id: 'c1', nome: 'Ana' } } },
      { key: 'c2', variables: { cliente: { id: 'c2', nome: 'Bia' } } },
    ]);

    expect(d.runs.rows[0]?.variables['clientes']).toHaveLength(2);
  });

  it('o para cada semeia uma execução por item da lista', async () => {
    const d = await rodar([
      { key: 'c1', variables: { cliente: { id: 'c1' } } },
      { key: 'c2', variables: { cliente: { id: 'c2' } } },
    ]);

    const semeadas = d.runs.rows.filter((r) => r.currentNodeId === 'a1' || r.stepsTaken > 0);
    expect(d.runs.rows).toHaveLength(3);
    expect(semeadas.length).toBeGreaterThan(0);
  });

  it('cada semeada enxerga os dados do item dela', async () => {
    const d = await rodar([{ key: 'c1', variables: { cliente: { id: 'c1', nome: 'Ana' } } }]);

    expect(d.runs.rows[1]?.variables).toMatchObject({ cliente: { id: 'c1', nome: 'Ana' } });
  });

  /** Lista vazia sai pelo "não achou" da busca, e o "para cada" nem chega a rodar. */
  it('sem achado, a busca desvia e nada é semeado', async () => {
    const d = await rodar([]);

    expect(d.runs.rows).toHaveLength(1);
  });

  it('percorrer uma lista que não existe não semeia nada, e não quebra', async () => {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    d.finders = { find_one: vi.fn().mockResolvedValue([{ key: 'c1', variables: {} }]) };
    const graph = comBuscaEIteracao();
    await ligada(d, {
      ...graph,
      nodes: graph.nodes.map((no) =>
        no.id === 'p1' ? { ...no, config: { list: 'nao-existe', limit: 10 } } : no,
      ),
    });
    await enqueueAutomationRun(d, {
      tenantId: 't1',
      triggerType: 'recurring',
      triggerRef: {},
      variables: {},
      now: AGORA,
    });

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(d.runs.rows).toHaveLength(1);
    expect(d.runs.rows[0]?.status).toBe('done');
  });
});

/**
 * AU-18 · AU-20 — os freios do "para cada".
 *
 * Semear é a operação que mais cresce sozinha no sistema: uma lista de duzentos clientes vira
 * duzentas execuções, cada uma podendo mandar mensagem. Os tetos são o que transforma "todo
 * mundo recebeu" em "vinte receberam e o resto está no log".
 */
describe('AU-18: os tetos do para cada', () => {
  const comLista = (limit: number): AutomationGraph => ({
    nodes: [
      { id: 'g1', kind: 'trigger', type: 'recurring', config: {}, position: { x: 0, y: 0 } },
      {
        id: 'p1',
        kind: 'forEach',
        type: 'for_each',
        config: { list: 'itens', limit },
        position: { x: 0, y: 60 },
      },
      { id: 'a1', kind: 'action', type: 'send_message', config: {}, position: { x: 0, y: 120 } },
    ],
    edges: [
      { id: 'e1', from: 'g1', port: 'next', to: 'p1' },
      { id: 'e2', from: 'p1', port: 'next', to: 'a1' },
    ],
  });

  const lista = (quantos: number) =>
    Array.from({ length: quantos }, (_, i) => ({
      chave: `c${String(i)}`,
      dados: { cliente: { id: `c${String(i)}` } },
    }));

  async function rodarCom(quantos: number, limit: number) {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    await ligada(d, comLista(limit));
    await enqueueAutomationRun(d, {
      tenantId: 't1',
      triggerType: 'recurring',
      triggerRef: {},
      variables: { itens: lista(quantos) },
      now: AGORA,
    });
    await advanceAutomationRun(d, ref(d), AGORA);
    return d;
  }

  it('o limite do bloco corta o excedente', async () => {
    const d = await rodarCom(10, 3);

    // A mãe mais três filhas.
    expect(d.runs.rows).toHaveLength(4);
  });

  /** O teto do motor vale mesmo com um limite digitado maior: `jsonb` aceita qualquer número. */
  it('o teto do motor vale acima do limite digitado', async () => {
    const d = await rodarCom(40, 999);

    expect(d.runs.rows.length).toBeLessThanOrEqual(TETO_DA_BUSCA + 1);
  });

  it('a mãe termina sem executar o resto do fluxo', async () => {
    const enviar = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: enviar });
    await ligada(d, comLista(5));
    await enqueueAutomationRun(d, {
      tenantId: 't1',
      triggerType: 'recurring',
      triggerRef: {},
      variables: { itens: lista(2) },
      now: AGORA,
    });

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(enviar).not.toHaveBeenCalled();
    expect(d.runs.rows[0]?.status).toBe('done');
  });

  it('cada filha começa no bloco seguinte, com os dados do item', async () => {
    const d = await rodarCom(1, 5);

    expect(d.runs.rows[1]).toMatchObject({
      currentNodeId: 'a1',
      variables: { cliente: { id: 'c0' } },
    });
  });
});

/**
 * AU-05 (revisto) — nada é descartado: o que não cabe agora fica na fila.
 *
 * O teto por hora recusava execuções, e recusar é perder trabalho: a lista de duzentos clientes
 * virava vinte alcançados e cento e oitenta que ninguém alcançaria nunca. O motor é uma fila
 * durável desde o começo — o freio certo é a **vazão**, não a porta fechada. Quem controla o
 * ritmo é o lote de cada passada; quem controla o estrago continua sendo o interruptor, que
 * cancela o que estiver na fila.
 */
describe('AU-05: a fila absorve, em vez de recusar', () => {
  const comLista = (): AutomationGraph => ({
    nodes: [
      { id: 'g1', kind: 'trigger', type: 'recurring', config: {}, position: { x: 0, y: 0 } },
      {
        id: 'p1',
        kind: 'forEach',
        type: 'for_each',
        config: { list: 'itens' },
        position: { x: 0, y: 60 },
      },
      { id: 'a1', kind: 'action', type: 'send_message', config: {}, position: { x: 0, y: 120 } },
    ],
    edges: [
      { id: 'e1', from: 'g1', port: 'next', to: 'p1' },
      { id: 'e2', from: 'p1', port: 'next', to: 'a1' },
    ],
  });

  const lista = (quantos: number) =>
    Array.from({ length: quantos }, (_, i) => ({
      chave: `c${String(i)}`,
      dados: { cliente: { id: `c${String(i)}` } },
    }));

  it('cem itens viram cem execuções, e nenhuma é recusada', async () => {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    await ligada(d, comLista());
    await enqueueAutomationRun(d, {
      tenantId: 't1',
      triggerType: 'recurring',
      triggerRef: {},
      variables: { itens: lista(100) },
      now: AGORA,
    });

    await advanceAutomationRun(d, ref(d), AGORA);

    // A mãe mais as cem filhas.
    expect(d.runs.rows).toHaveLength(101);
  });

  /** Muitos gatilhos seguidos também não são recusados: a fila cresce e drena. */
  it('o gatilho continua enfileirando depois de vinte execuções na hora', async () => {
    const d = deps();
    await ligada(d);
    for (let i = 0; i < 25; i += 1) await enfileirarUma(d);

    expect(d.runs.rows).toHaveLength(25);
  });

  /**
   * O que segura o ritmo é o lote da passada: cem na fila não viram cem mensagens no mesmo
   * segundo. As que sobram continuam pendentes, e a passada seguinte as pega.
   */
  it('a passada processa o lote e deixa o resto na fila', async () => {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    await ligada(d);
    for (let i = 0; i < 30; i += 1) await enfileirarUma(d);

    const feitas = await resumeDueRuns(d, { workerId: 'w1', now: AGORA, limit: 10 });

    expect(feitas).toBe(10);
    expect(d.runs.rows.filter((r) => r.status === 'pending')).toHaveLength(20);
  });

  /**
   * O freio de mão: desligar a automação cancela o que ainda não rodou. É o que faz uma regra
   * ruim parar **de verdade**, mesmo com novecentas execuções na fila.
   */
  it('desligar a automação cancela o que está na fila', async () => {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    const criada = await ligada(d);
    await enfileirarUma(d);
    await d.automations.update('t1', criada.id, { enabled: false });

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(d.runs.rows[0]?.status).toBe('cancelled');
  });
});

/**
 * AU-05 — a passada drena a fila em lotes, em vez de parar no primeiro.
 *
 * Sem isto, cem execuções na fila levariam cinco varreduras — cinco minutos — para rodar, e a
 * automação pareceria travada. O lote continua existindo (é ele que impede cem mensagens no
 * mesmo instante), mas a passada repete o lote enquanto houver trabalho vencido, até o teto de
 * lotes: um processo não pode ficar preso numa fila infinita, senão a varredura seguinte nunca
 * acontece.
 */
describe('AU-05: a passada drena em lotes', () => {
  async function comFila(quantas: number) {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    await ligada(d);
    for (let i = 0; i < quantas; i += 1) await enfileirarUma(d);
    return d;
  }

  it('processa mais que um lote na mesma passada', async () => {
    const d = await comFila(30);

    const feitas = await resumeDueRuns(d, { workerId: 'w1', now: AGORA, limit: 10, maxBatches: 4 });

    expect(feitas).toBe(30);
    expect(d.runs.rows.every((r) => r.status === 'done')).toBe(true);
  });

  it('para no teto de lotes, e deixa o resto para a passada seguinte', async () => {
    const d = await comFila(30);

    const feitas = await resumeDueRuns(d, { workerId: 'w1', now: AGORA, limit: 10, maxBatches: 2 });

    expect(feitas).toBe(20);
    expect(d.runs.rows.filter((r) => r.status === 'pending')).toHaveLength(10);
  });

  it('fila vazia não custa nada', async () => {
    const d = deps();

    expect(await resumeDueRuns(d, { workerId: 'w1', now: AGORA, limit: 10, maxBatches: 4 })).toBe(
      0,
    );
  });
});

/**
 * AU-21 — o gatilho de webhook acorda **a automação daquele gancho**, e não todas.
 *
 * Um tenant tem vários ganchos — um do site, um do formulário, um do parceiro —, e todos
 * chegam pelo mesmo tipo de gatilho. Sem o nome no filtro, a chamada do site dispararia
 * também o fluxo do parceiro, com o corpo errado no contexto.
 */
describe('AU-21: o gancho escolhe quem acorda', () => {
  async function comGancho(d: Deps, nome: string) {
    const graph = grafo(
      { id: 'g1', kind: 'trigger', type: 'webhook_received', config: { name: nome } },
      { id: 'f1', kind: 'end', type: 'end' },
    );
    const criada = await d.automations.create({
      tenantId: 't1',
      name: `Gancho ${nome}`,
      description: null,
      graph,
      createdBy: 'u-ana',
    });
    await d.automations.update('t1', criada.id, {
      enabled: true,
      runAsUserId: 'u-ana',
      triggerType: 'webhook_received',
      triggerConfig: { name: nome },
    });
    return criada;
  }

  it('só a automação do nome chamado abre execução', async () => {
    const d = deps();
    const doSite = await comGancho(d, 'site');
    await comGancho(d, 'parceiro');

    const abertas = await enqueueAutomationRun(d, {
      tenantId: 't1',
      triggerType: 'webhook_received',
      triggerRef: { hook: 'site' },
      matchConfig: { name: 'site' },
      variables: { webhook: { nome: 'site' } },
      now: AGORA,
    });

    expect(abertas).toHaveLength(1);
    expect(abertas[0]?.automationId).toBe(doSite.id);
  });

  it('nome que ninguém espera não abre nada', async () => {
    const d = deps();
    await comGancho(d, 'site');

    const abertas = await enqueueAutomationRun(d, {
      tenantId: 't1',
      triggerType: 'webhook_received',
      triggerRef: {},
      matchConfig: { name: 'outro' },
      variables: {},
      now: AGORA,
    });

    expect(abertas).toHaveLength(0);
  });

  /** Sem filtro, o comportamento é o de sempre: todo mundo daquele gatilho acorda. */
  it('gatilho sem filtro continua acordando todas', async () => {
    const d = deps();
    await ligada(d);

    expect(await enfileirarUma(d)).toHaveLength(1);
  });
});

describe('AU-23: o que a ação respondeu vira variável do fluxo', () => {
  it('guarda a resposta sob o nome pedido, e o bloco seguinte a enxerga', async () => {
    const d = deps({
      http_request: async () => ({ status: 200, body: '{"plano":"ouro"}' }),
      send_message: async ({ config }) => ({ enviado: config['text'] }),
    });
    const g = grafo(
      { id: 'g1', kind: 'trigger', type: 'message_received' },
      {
        id: 'a1',
        kind: 'action',
        type: 'http_request',
        config: { url: 'https://api.parceiro.com/x', saveAs: 'resposta' },
      },
      {
        id: 'a2',
        kind: 'action',
        type: 'send_message',
        config: { text: 'status {{resposta.status}}' },
      },
      { id: 'f1', kind: 'end', type: 'end' },
    );
    await ligada(d, g);
    const [ref] = await enfileirarUma(d);

    await advanceAutomationRun(d, ref!, AGORA);

    const passos = d.steps.rows;
    const envio = passos.find((p) => p.nodeId === 'a2');
    expect(envio?.detail).toEqual({ enviado: 'status 200' });
  });

  it('sem nome pedido, nada entra no contexto — o log continua sendo o registro', async () => {
    const d = deps({
      http_request: async () => ({ status: 500 }),
      send_message: async ({ config }) => ({ enviado: config['text'] }),
    });
    const g = grafo(
      { id: 'g1', kind: 'trigger', type: 'message_received' },
      { id: 'a1', kind: 'action', type: 'http_request', config: { url: 'https://x.com/y' } },
      { id: 'a2', kind: 'action', type: 'send_message', config: { text: 'v={{resposta.status}}' } },
      { id: 'f1', kind: 'end', type: 'end' },
    );
    await ligada(d, g);
    const [ref] = await enfileirarUma(d);

    await advanceAutomationRun(d, ref!, AGORA);

    const passos = d.steps.rows;
    expect(passos.find((p) => p.nodeId === 'a2')?.detail).toEqual({ enviado: 'v=' });
  });

  it('a variável guardada sobrevive a uma espera, porque é salva com a execução', async () => {
    const d = deps({
      http_request: async () => ({ status: 201 }),
      send_message: async ({ config }) => ({ enviado: config['text'] }),
    });
    const g = grafo(
      { id: 'g1', kind: 'trigger', type: 'message_received' },
      {
        id: 'a1',
        kind: 'action',
        type: 'http_request',
        config: { url: 'https://x/y', saveAs: 'r' },
      },
      { id: 'w1', kind: 'delay', type: 'wait', config: { minutes: 60 } },
      { id: 'a2', kind: 'action', type: 'send_message', config: { text: 'saiu {{r.status}}' } },
      { id: 'f1', kind: 'end', type: 'end' },
    );
    await ligada(d, g);
    const [ref] = await enfileirarUma(d);
    await advanceAutomationRun(d, ref!, AGORA);

    const depois = new Date(AGORA.getTime() + 61 * 60_000);
    const [retomada] = await d.runs.claimDue('worker', depois, 10, 300_000);
    await advanceAutomationRun(d, retomada!, depois);

    const passos = d.steps.rows;
    expect(passos.find((p) => p.nodeId === 'a2')?.detail).toEqual({ enviado: 'saiu 201' });
  });
});

describe('AU-23: o código do bloco chega ao vm como foi escrito', () => {
  it('não troca marcador dentro do código — bloco dentro de bloco não é variável', async () => {
    let recebido = '';
    const d = deps({
      run_code: async ({ config }) => {
        recebido = String(config['code']);
        return { ok: true };
      },
    });
    const g = grafo(
      { id: 'g1', kind: 'trigger', type: 'message_received' },
      {
        id: 'a1',
        kind: 'action',
        type: 'run_code',
        config: { code: 'let y = 1; if (dados.x) {{ y }} return { y };' },
      },
      { id: 'f1', kind: 'end', type: 'end' },
    );
    await ligada(d, g);
    const [ref] = await enfileirarUma(d);

    await advanceAutomationRun(d, ref!, AGORA);

    expect(recebido).toBe('let y = 1; if (dados.x) {{ y }} return { y };');
  });
});

/**
 * AU-24 — o caminho de erro.
 *
 * Antes disto, ação que falha só tinha um destino: tentar de novo e, no fim, parar tudo. É o
 * certo para provedor fora do ar, e é o errado para "o parceiro respondeu 422" — aí o fluxo
 * tem o que fazer, e quem desenhou sabe o quê. Ligar a saída de erro é dizer justamente isso:
 * **este erro é previsto, não insista, siga por aqui**.
 */
describe('AU-24: o caminho de erro por ação', () => {
  function comSaidaDeErro(): AutomationGraph {
    return {
      nodes: [
        {
          id: 'g1',
          kind: 'trigger',
          type: 'message_received',
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: 'a1',
          kind: 'action',
          type: 'http_request',
          config: { url: 'https://x/y' },
          position: { x: 0, y: 1 },
        },
        { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 2 } },
        {
          id: 'a2',
          kind: 'action',
          type: 'notify_team',
          config: { text: 'deu ruim: {{erro.motivo}}' },
          position: { x: 1, y: 2 },
        },
        { id: 'f2', kind: 'end', type: 'end', config: {}, position: { x: 1, y: 3 } },
      ],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'a1' },
        { id: 'e2', from: 'a1', port: 'next', to: 'f1' },
        { id: 'e3', from: 'a1', port: 'error', to: 'a2' },
        { id: 'e4', from: 'a2', port: 'next', to: 'f2' },
      ],
    };
  }

  it('segue pela saída de erro em vez de tentar de novo', async () => {
    const avisar = vi.fn().mockResolvedValue({ ok: true });
    const d = deps({
      http_request: vi.fn().mockRejectedValue(new Error('a chamada devolveu 422')),
      notify_team: avisar,
    });
    await ligada(d, comSaidaDeErro());
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(avisar).toHaveBeenCalledTimes(1);
    expect(d.runs.rows[0]).toMatchObject({ status: 'done', attempts: 0 });
  });

  it('o motivo do erro entra no contexto, para o caminho de erro poder dizer o que houve', async () => {
    const avisar = vi.fn().mockResolvedValue({ ok: true });
    const d = deps({
      http_request: vi.fn().mockRejectedValue(new Error('a chamada devolveu 422')),
      notify_team: avisar,
    });
    await ligada(d, comSaidaDeErro());
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(avisar.mock.calls[0]?.[0]?.config).toMatchObject({
      text: 'deu ruim: a chamada devolveu 422',
    });
  });

  it('o erro fica no log do mesmo jeito — desviar não é esconder', async () => {
    const d = deps({
      http_request: vi.fn().mockRejectedValue(new Error('a chamada devolveu 422')),
      notify_team: vi.fn().mockResolvedValue({}),
    });
    await ligada(d, comSaidaDeErro());
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    const erro = d.steps.rows.find((s) => s.outcome === 'erro');
    expect(erro).toMatchObject({ nodeId: 'a1', detail: { motivo: 'a chamada devolveu 422' } });
  });

  it('sem saída de erro ligada, continua tentando de novo como antes', async () => {
    const d = deps({ send_message: vi.fn().mockRejectedValue(new Error('provedor fora do ar')) });
    await ligada(d);
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(d.runs.rows[0]).toMatchObject({ status: 'pending', attempts: 1 });
  });
});

/**
 * AU-25 — o ensaio.
 *
 * Ligar uma automação para descobrir o que ela faz é caro: ela age sobre gente de verdade, e o
 * que sai não volta. O ensaio percorre o mesmo grafo, pelo mesmo interpretador de caminho, e
 * mostra por onde ele passaria — **sem executar ação nenhuma e sem gravar execução nenhuma**.
 *
 * As buscas rodam de verdade, porque elas só leem: é o que faz o ensaio responder "com os dados
 * de agora, esta condição dá sim ou não?", que é justamente a pergunta.
 */
describe('AU-25: ensaiar sem ligar', () => {
  it('mostra o caminho e não executa ação nenhuma', async () => {
    const enviar = vi.fn();
    const d = deps({ send_message: enviar });
    const criada = await ligada(d);

    const passos = await simulateAutomationRun(d, ctxAdmin(), {
      automationId: criada.id,
      variables: { contato: { nome: 'Ana' } },
      now: AGORA,
    });

    expect(enviar).not.toHaveBeenCalled();
    expect(passos.map((p) => p.nodeId)).toEqual(['g1', 'a1', 'f1']);
    expect(passos.find((p) => p.nodeId === 'a1')).toMatchObject({
      outcome: 'faria',
      detail: { text: 'Oi Ana!' },
    });
  });

  it('não grava execução nem passo — ensaio não aparece no log da automação', async () => {
    const d = deps({ send_message: vi.fn() });
    const criada = await ligada(d);

    await simulateAutomationRun(d, ctxAdmin(), {
      automationId: criada.id,
      variables: {},
      now: AGORA,
    });

    expect(d.runs.rows).toHaveLength(0);
    expect(d.steps.rows).toHaveLength(0);
  });

  it('decide a condição com os dados dados, e mostra por qual lado saiu', async () => {
    const d = deps({ send_message: vi.fn() });
    const g: AutomationGraph = {
      nodes: [
        {
          id: 'g1',
          kind: 'trigger',
          type: 'message_received',
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: 'c1',
          kind: 'condition',
          type: 'field',
          config: { field: 'mensagem.texto', operator: 'contains', value: 'preço' },
          position: { x: 0, y: 1 },
        },
        { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 2 } },
        { id: 'f2', kind: 'end', type: 'end', config: {}, position: { x: 1, y: 2 } },
      ],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'c1' },
        { id: 'e2', from: 'c1', port: 'true', to: 'f1' },
        { id: 'e3', from: 'c1', port: 'false', to: 'f2' },
      ],
    };
    const criada = await ligada(d, g);

    const passos = await simulateAutomationRun(d, ctxAdmin(), {
      automationId: criada.id,
      variables: { mensagem: { texto: 'qual o preço?' } },
      now: AGORA,
    });

    expect(passos.find((p) => p.nodeId === 'c1')?.outcome).toBe('true');
    expect(passos.at(-1)?.nodeId).toBe('f1');
  });

  it('a espera não espera: mostra até quando seria e segue', async () => {
    const d = deps({ send_message: vi.fn() });
    const g = grafo(
      { id: 'g1', kind: 'trigger', type: 'message_received' },
      { id: 'w1', kind: 'delay', type: 'wait', config: { amount: 2, unit: 'days' } },
      { id: 'a1', kind: 'action', type: 'send_message', config: { text: 'oi' } },
      { id: 'f1', kind: 'end', type: 'end' },
    );
    const criada = await ligada(d, g);

    const passos = await simulateAutomationRun(d, ctxAdmin(), {
      automationId: criada.id,
      variables: {},
      now: AGORA,
    });

    expect(passos.map((p) => p.nodeId)).toEqual(['g1', 'w1', 'a1', 'f1']);
    expect(passos.find((p) => p.nodeId === 'w1')?.outcome).toBe('esperaria');
  });

  it('ensaia automação desligada — é para isso que ele serve, decidir se liga', async () => {
    const d = deps({ send_message: vi.fn() });
    const criada = await d.automations.create({
      tenantId: 't1',
      name: 'Rascunho',
      description: null,
      graph: SIMPLES,
      createdBy: 'u-ana',
    });

    const passos = await simulateAutomationRun(d, ctxAdmin(), {
      automationId: criada.id,
      variables: {},
      now: AGORA,
    });

    expect(passos).not.toHaveLength(0);
  });

  it('para no teto de passos, como o motor de verdade', async () => {
    const d = deps({ send_message: vi.fn() });
    const g: AutomationGraph = {
      nodes: [
        {
          id: 'g1',
          kind: 'trigger',
          type: 'message_received',
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: 's1',
          kind: 'setVariable',
          type: 'set',
          config: { name: 'x', value: '1' },
          position: { x: 0, y: 1 },
        },
      ],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 's1' },
        { id: 'e2', from: 's1', port: 'next', to: 's1' },
      ],
    };
    const criada = await ligada(d, g);

    const passos = await simulateAutomationRun(d, ctxAdmin(), {
      automationId: criada.id,
      variables: {},
      now: AGORA,
    });

    expect(passos).toHaveLength(TETO_DE_PASSOS);
  });

  it('recusa quem não é da equipe — ensaiar mostra dado de cliente', async () => {
    const d = deps({});
    const criada = await ligada(d);

    await expect(
      simulateAutomationRun(
        d,
        { tenantId: 't1', actor: { kind: 'customer' as const, customerId: 'c1', userId: 'u-cli' } },
        { automationId: criada.id, variables: {}, now: AGORA },
      ),
    ).rejects.toThrow();
  });
});

function ctxAdmin() {
  return {
    tenantId: 't1',
    actor: { kind: 'team' as const, userId: 'u-ana', role: 'admin' as const },
  };
}

describe('AU-26: o log guarda o valor que o desvio leu', () => {
  it('grava campo e valor no passo da condição, não só o lado por onde saiu', async () => {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    const g: AutomationGraph = {
      nodes: [
        {
          id: 'g1',
          kind: 'trigger',
          type: 'message_received',
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: 'c1',
          kind: 'condition',
          type: 'field',
          config: { field: 'mensagem.texto', operator: 'contains', value: 'preço' },
          position: { x: 0, y: 1 },
        },
        { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 2 } },
        { id: 'f2', kind: 'end', type: 'end', config: {}, position: { x: 1, y: 2 } },
      ],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'c1' },
        { id: 'e2', from: 'c1', port: 'true', to: 'f1' },
        { id: 'e3', from: 'c1', port: 'false', to: 'f2' },
      ],
    };
    await ligada(d, g);
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(d.steps.rows.find((s) => s.nodeId === 'c1')?.detail).toEqual({
      campo: 'mensagem.texto',
      valor: 'quanto custa?',
    });
  });
});

/**
 * AU-26 — desligar um bloco sem tirá-lo do quadro.
 *
 * Tirar o bloco para testar sem ele custa refazer duas ligações e, depois, lembrar de refazer
 * de novo. Desligado, ele fica no desenho, no lugar, e o fluxo passa por cima.
 */
describe('AU-26: bloco desligado', () => {
  it('pula a ação desligada e segue o fluxo', async () => {
    const enviar = vi.fn().mockResolvedValue({});
    const avisar = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: enviar, notify_team: avisar });
    const g = grafo(
      { id: 'g1', kind: 'trigger', type: 'message_received' },
      {
        id: 'a1',
        kind: 'action',
        type: 'send_message',
        config: { text: 'oi', disabled: true },
      },
      { id: 'a2', kind: 'action', type: 'notify_team', config: { text: 'avisa' } },
      { id: 'f1', kind: 'end', type: 'end' },
    );
    await ligada(d, g);
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(enviar).not.toHaveBeenCalled();
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(d.steps.rows.find((s) => s.nodeId === 'a1')?.outcome).toBe('pulou');
  });

  it('espera desligada não segura o fluxo', async () => {
    const enviar = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: enviar });
    const g = grafo(
      { id: 'g1', kind: 'trigger', type: 'message_received' },
      {
        id: 'w1',
        kind: 'delay',
        type: 'wait',
        config: { amount: 3, unit: 'days', disabled: true },
      },
      { id: 'a1', kind: 'action', type: 'send_message', config: { text: 'oi' } },
      { id: 'f1', kind: 'end', type: 'end' },
    );
    await ligada(d, g);
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(d.runs.rows[0]?.status).toBe('done');
  });

  it('desvio desligado é ignorado: quem tem dois lados não dá para pular', async () => {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    const g: AutomationGraph = {
      nodes: [
        {
          id: 'g1',
          kind: 'trigger',
          type: 'message_received',
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: 'c1',
          kind: 'condition',
          type: 'field',
          config: { field: 'mensagem.texto', operator: 'contains', value: 'zzz', disabled: true },
          position: { x: 0, y: 1 },
        },
        { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 2 } },
        { id: 'f2', kind: 'end', type: 'end', config: {}, position: { x: 1, y: 2 } },
      ],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'c1' },
        { id: 'e2', from: 'c1', port: 'true', to: 'f1' },
        { id: 'e3', from: 'c1', port: 'false', to: 'f2' },
      ],
    };
    await ligada(d, g);
    await enfileirarUma(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(d.steps.rows.find((s) => s.nodeId === 'c1')?.outcome).toBe('false');
  });
});

/**
 * AU-27 — o que entra e o que sai de cada bloco.
 *
 * Desenhar um fluxo é encadear dados, e a pergunta que trava quem desenha é sempre a mesma:
 * "o bloco anterior me entrega o quê?". O ensaio já andava pelo caminho; passou a carregar,
 * em cada passo, o contexto que **chegou** ali e o que aquele bloco **produziu** — é o que a
 * tela desenha à esquerda e à direita do bloco aberto.
 */
describe('AU-27: entrada e saída por bloco', () => {
  it('o gatilho entrega o contexto com que a execução começou', async () => {
    const d = deps({ send_message: vi.fn() });
    const criada = await ligada(d);

    const passos = await simulateAutomationRun(d, ctxAdmin(), {
      automationId: criada.id,
      variables: { contato: { nome: 'Ana' } },
      now: AGORA,
    });

    expect(passos[0]).toMatchObject({
      nodeId: 'g1',
      input: { contato: { nome: 'Ana' } },
      output: { contato: { nome: 'Ana' } },
    });
  });

  it('a ação mostra o que receberia, com os marcadores já trocados', async () => {
    const d = deps({ send_message: vi.fn() });
    const criada = await ligada(d);

    const passos = await simulateAutomationRun(d, ctxAdmin(), {
      automationId: criada.id,
      variables: { contato: { nome: 'Ana' } },
      now: AGORA,
    });

    expect(passos.find((p) => p.nodeId === 'a1')?.output).toEqual({ text: 'Oi Ana!' });
  });

  it('definir variável entrega só a variável que definiu, não o contexto inteiro', async () => {
    const d = deps({ send_message: vi.fn() });
    const g = grafo(
      { id: 'g1', kind: 'trigger', type: 'message_received' },
      { id: 's1', kind: 'setVariable', type: 'set', config: { name: 'saudacao', value: 'Oi' } },
      { id: 'f1', kind: 'end', type: 'end' },
    );
    const criada = await ligada(d, g);

    const passos = await simulateAutomationRun(d, ctxAdmin(), {
      automationId: criada.id,
      variables: { contato: { nome: 'Ana' } },
      now: AGORA,
    });

    const passo = passos.find((p) => p.nodeId === 's1');
    expect(passo?.output).toEqual({ saudacao: 'Oi' });
    // A entrada é o contexto de antes — sem a variável que este bloco ainda não tinha definido.
    expect(passo?.input).toEqual({ contato: { nome: 'Ana' } });
  });

  it('o bloco seguinte recebe na entrada o que o anterior produziu', async () => {
    const d = deps({ send_message: vi.fn() });
    const g = grafo(
      { id: 'g1', kind: 'trigger', type: 'message_received' },
      { id: 's1', kind: 'setVariable', type: 'set', config: { name: 'saudacao', value: 'Oi' } },
      { id: 'a1', kind: 'action', type: 'send_message', config: { text: '{{saudacao}}!' } },
      { id: 'f1', kind: 'end', type: 'end' },
    );
    const criada = await ligada(d, g);

    const passos = await simulateAutomationRun(d, ctxAdmin(), {
      automationId: criada.id,
      variables: {},
      now: AGORA,
    });

    expect(passos.find((p) => p.nodeId === 'a1')?.input).toEqual({ saudacao: 'Oi' });
  });

  it('a condição entrega o lado e o valor que leu', async () => {
    const d = deps({});
    const g: AutomationGraph = {
      nodes: [
        {
          id: 'g1',
          kind: 'trigger',
          type: 'message_received',
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: 'c1',
          kind: 'condition',
          type: 'field',
          config: { field: 'mensagem.texto', operator: 'contains', value: 'preço' },
          position: { x: 0, y: 1 },
        },
        { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 2 } },
        { id: 'f2', kind: 'end', type: 'end', config: {}, position: { x: 1, y: 2 } },
      ],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'c1' },
        { id: 'e2', from: 'c1', port: 'true', to: 'f1' },
        { id: 'e3', from: 'c1', port: 'false', to: 'f2' },
      ],
    };
    const criada = await ligada(d, g);

    const passos = await simulateAutomationRun(d, ctxAdmin(), {
      automationId: criada.id,
      variables: { mensagem: { texto: 'qual o preço?' } },
      now: AGORA,
    });

    expect(passos.find((p) => p.nodeId === 'c1')?.output).toEqual({
      saida: 'true',
      campo: 'mensagem.texto',
      valor: 'qual o preço?',
    });
  });

  it('a entrada é um retrato: mexer no contexto depois não muda o que já foi anotado', async () => {
    const d = deps({ send_message: vi.fn() });
    const g = grafo(
      { id: 'g1', kind: 'trigger', type: 'message_received' },
      { id: 's1', kind: 'setVariable', type: 'set', config: { name: 'x', value: 'depois' } },
      { id: 'f1', kind: 'end', type: 'end' },
    );
    const criada = await ligada(d, g);

    const passos = await simulateAutomationRun(d, ctxAdmin(), {
      automationId: criada.id,
      variables: {},
      now: AGORA,
    });

    expect(passos[0]?.input).toEqual({});
  });
});

describe('AU-27: o ensaio corre sobre o desenho que está na tela', () => {
  it('usa o grafo mandado junto, e não o que está salvo', async () => {
    const d = deps({ send_message: vi.fn() });
    const criada = await ligada(d);
    const outro = grafo(
      { id: 'g1', kind: 'trigger', type: 'message_received' },
      {
        id: 's1',
        kind: 'setVariable',
        type: 'set',
        config: { name: 'novo', value: 'ainda não salvo' },
      },
      { id: 'f1', kind: 'end', type: 'end' },
    );

    const passos = await simulateAutomationRun(d, ctxAdmin(), {
      automationId: criada.id,
      variables: {},
      graph: outro,
      now: AGORA,
    });

    expect(passos.map((p) => p.nodeId)).toEqual(['g1', 's1', 'f1']);
  });

  it('sem grafo junto, continua ensaiando o que está salvo', async () => {
    const d = deps({ send_message: vi.fn() });
    const criada = await ligada(d);

    const passos = await simulateAutomationRun(d, ctxAdmin(), {
      automationId: criada.id,
      variables: {},
      now: AGORA,
    });

    expect(passos.map((p) => p.nodeId)).toEqual(['g1', 'a1', 'f1']);
  });

  it('recusa desenho torto: ensaiar o que não fecha daria caminho que não existe', async () => {
    const d = deps({});
    const criada = await ligada(d);

    await expect(
      simulateAutomationRun(d, ctxAdmin(), {
        automationId: criada.id,
        variables: {},
        graph: { nodes: [], edges: [] },
        now: AGORA,
      }),
    ).rejects.toThrow();
  });
});

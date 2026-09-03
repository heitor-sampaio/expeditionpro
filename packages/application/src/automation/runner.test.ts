import { describe, expect, it, vi } from 'vitest';
import { fakeAutomationRepository } from './automationRepository.fake.js';
import {
  fakeAutomationRunRepository,
  fakeAutomationRunStepRepository,
} from './automationRunRepository.fake.js';
import { fakeMembershipRepository } from '../team/membershipRepository.fake.js';
import { enqueueAutomationRun, TETO_POR_HORA } from './enqueueAutomationRun.js';
import { advanceAutomationRun, TETO_DE_PASSOS } from './advanceAutomationRun.js';
import { resumeDueRuns } from './resumeDueRuns.js';
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

  /**
   * AU-05: uma regra ruim manda a mesma mensagem para trinta pessoas antes de alguém ver. O
   * teto por hora é o que transforma isso em "trinta tentativas, N entregues e o resto barrado".
   */
  it('para de enfileirar ao estourar o teto por hora', async () => {
    const d = deps();
    await ligada(d);
    for (let i = 0; i < TETO_POR_HORA; i += 1) await enfileirarUma(d);

    const excedente = await enfileirarUma(d);

    expect(excedente).toHaveLength(0);
    expect(d.runs.rows).toHaveLength(TETO_POR_HORA);
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
 * A execução de gatilho ainda por rodar. Filha de busca tem chave de idempotência; a que nasce
 * de um evento, não — é assim que se pega a "mãe" da passada seguinte sem depender da ordem.
 */
function refPendente(d: Deps) {
  const row = d.runs.rows.find((r) => r.status === 'pending' && r.idempotencyKey === null)!;
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
 * AU-18 — a busca que semeia.
 *
 * O gatilho de tempo não traz entidade nenhuma: "a cada cinco minutos" não sabe sobre quem
 * agir. A busca resolve isso **abrindo uma execução por achado**, cada uma com o contexto de
 * um — e não iterando dentro de uma execução só.
 *
 * A diferença não é de estilo. Uma execução por item é o que mantém o log respondendo "por que
 * **este** cliente recebeu isso?" (AU-06), o que faz o teto de passos e as tentativas valerem
 * por item, e o que evita um laço no grafo, que AU-07 proíbe.
 */
describe('AU-18: a busca semeia uma execução por achado', () => {
  const comBusca = (): AutomationGraph => ({
    nodes: [
      { id: 'g1', kind: 'trigger', type: 'recurring', config: {}, position: { x: 0, y: 0 } },
      {
        id: 'b1',
        kind: 'forEach',
        type: 'find_stale_conversations',
        config: { minutes: 30, waiting: 'customer', limit: 10 },
        position: { x: 0, y: 60 },
      },
      { id: 'a1', kind: 'action', type: 'send_message', config: {}, position: { x: 0, y: 120 } },
      { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 180 } },
    ],
    edges: [
      { id: 'e1', from: 'g1', port: 'next', to: 'b1' },
      { id: 'e2', from: 'b1', port: 'next', to: 'a1' },
      { id: 'e3', from: 'a1', port: 'next', to: 'f1' },
    ],
  });

  const achados = (...ids: string[]) =>
    vi.fn().mockResolvedValue(ids.map((id) => ({ key: id, variables: { conversa: { id } } })));

  async function comMae(d: Deps) {
    await ligada(d, comBusca());
    await enqueueAutomationRun(d, {
      tenantId: 't1',
      triggerType: 'recurring',
      triggerRef: {},
      variables: { agora: { data: '2026-09-03', hora: '09:00' } },
      now: AGORA,
    });
  }

  it('abre uma execução por item, e a mãe termina sem executar o resto', async () => {
    const enviar = vi.fn().mockResolvedValue({});
    const d = deps({ send_message: enviar });
    d.finders = { find_stale_conversations: achados('c1', 'c2') };
    await comMae(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    // A mãe percorreu gatilho e busca, e parou ali: quem age são as filhas.
    expect(enviar).not.toHaveBeenCalled();
    expect(d.runs.rows[0]?.status).toBe('done');
    expect(d.runs.rows).toHaveLength(3);
  });

  it('cada filha começa no bloco seguinte à busca, com o contexto do item', async () => {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    d.finders = { find_stale_conversations: achados('c1') };
    await comMae(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    const filha = d.runs.rows[1];
    expect(filha?.currentNodeId).toBe('a1');
    expect(filha?.variables).toMatchObject({ conversa: { id: 'c1' } });
  });

  /** O contexto da mãe desce junto: o que o gatilho trouxe continua valendo na filha. */
  it('a filha herda o contexto da execução que buscou', async () => {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    d.finders = { find_stale_conversations: achados('c1') };
    await comMae(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(d.runs.rows[1]?.variables).toMatchObject({
      agora: { data: '2026-09-03', hora: '09:00' },
    });
  });

  /**
   * A busca roda de cinco em cinco minutos e a conversa continua parada: sem a janela, o mesmo
   * contato seria semeado doze vezes por hora. A janela é o próprio "parado há trinta minutos".
   */
  it('a mesma entidade não é semeada duas vezes dentro da janela', async () => {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    d.finders = { find_stale_conversations: achados('c1') };
    await comMae(d);
    await advanceAutomationRun(d, ref(d), AGORA);

    // Cinco minutos depois, a varredura passa de novo e a conversa continua parada.
    const depois = new Date(AGORA.getTime() + 5 * 60_000);
    await enqueueAutomationRun(d, {
      tenantId: 't1',
      triggerType: 'recurring',
      triggerRef: {},
      variables: {},
      now: depois,
    });
    await advanceAutomationRun(d, refPendente(d), depois);

    expect(d.runs.rows.filter((r) => r.idempotencyKey?.startsWith('b1:c1:'))).toHaveLength(1);
  });

  it('o limite por passada corta o excedente', async () => {
    const d = deps({ send_message: vi.fn().mockResolvedValue({}) });
    d.finders = { find_stale_conversations: achados('c1', 'c2', 'c3', 'c4') };
    await ligada(d, {
      ...comBusca(),
      nodes: comBusca().nodes.map((no) =>
        no.id === 'b1' ? { ...no, config: { minutes: 30, waiting: 'customer', limit: 2 } } : no,
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

    expect(d.runs.rows.filter((r) => r.currentNodeId === 'a1')).toHaveLength(2);
  });

  /** Busca que este servidor não conhece é grafo salvo por uma versão mais nova: falha dizendo. */
  it('busca desconhecida falha com o nome dela no motivo', async () => {
    const d = deps();
    d.finders = {};
    await comMae(d);

    await advanceAutomationRun(d, ref(d), AGORA);

    expect(d.runs.rows[0]).toMatchObject({
      status: 'failed',
      lastError: expect.stringContaining('find_stale_conversations'),
    });
  });
});

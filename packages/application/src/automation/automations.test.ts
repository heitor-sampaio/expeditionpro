import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeAutomationRepository } from './automationRepository.fake.js';
import { createAutomation } from './createAutomation.js';
import { saveAutomationGraph } from './saveAutomationGraph.js';
import { setAutomationEnabled } from './setAutomationEnabled.js';
import { listAutomations } from './listAutomations.js';
import { getAutomation } from './getAutomation.js';
import { deleteAutomation } from './deleteAutomation.js';
import { BusinessRuleError, ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { AutomationGraph } from '@expedition/domain';

function ctxCom(role: 'owner' | 'admin' | 'operator' | 'viewer'): RequestContext {
  return { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u-ana', role } };
}

const cliente: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u-cli', customerId: 'c1' },
};

function deps() {
  return { automations: fakeAutomationRepository(), audit: fakeAuditLogRepository() };
}

const GRAFO_BOM: AutomationGraph = {
  nodes: [
    {
      id: 'g1',
      kind: 'trigger',
      type: 'message_received',
      config: {},
      position: { x: 0, y: 0 },
    },
    { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 120 } },
  ],
  edges: [{ id: 'e1', from: 'g1', port: 'next', to: 'f1' }],
};

async function comAutomacao(d: ReturnType<typeof deps>, role: 'owner' | 'admin' = 'owner') {
  return createAutomation(d, ctxCom(role), {
    name: 'Responder quem pergunta preço',
    triggerType: 'message_received',
  });
}

/**
 * AU-02 — automação nasce desligada, e ligar é ato explícito.
 *
 * Não é conservadorismo: no instante em que ela liga, passa a agir sobre gente de verdade, em
 * escala e sem ninguém olhando. Uma regra ruim manda a mesma mensagem para trinta pessoas antes
 * de alguém perceber.
 */
describe('AU-02: criar automação', () => {
  it('nasce desligada', async () => {
    const d = deps();

    const criada = await comAutomacao(d);

    expect(criada.enabled).toBe(false);
  });

  it('nasce com o grafo só do gatilho — é por onde a tela começa', async () => {
    const d = deps();

    const criada = await comAutomacao(d);

    expect(criada.graph.nodes).toHaveLength(1);
    expect(criada.graph.nodes[0]?.kind).toBe('trigger');
  });

  it('nome em branco é recusado', async () => {
    const d = deps();

    await expect(
      createAutomation(d, ctxCom('owner'), { name: '   ', triggerType: 'message_received' }),
    ).rejects.toBeInstanceOf(RequiredFieldError);
  });

  it('nome repetido é recusado — dois iguais viram engano na conversa da equipe', async () => {
    const d = deps();
    await comAutomacao(d);

    await expect(comAutomacao(d)).rejects.toMatchObject({ code: 'duplicate_automation' });
  });

  it('operator não cria: automação age com poder de quem a liga', async () => {
    await expect(
      createAutomation(deps(), ctxCom('operator'), {
        name: 'X',
        triggerType: 'message_received',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não chega aqui (AU-10)', async () => {
    await expect(
      createAutomation(deps(), cliente, { name: 'X', triggerType: 'message_received' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('AU-07: salvar o desenho', () => {
  it('grafo válido é guardado', async () => {
    const d = deps();
    const criada = await comAutomacao(d);

    const salva = await saveAutomationGraph(d, ctxCom('owner'), {
      automationId: criada.id,
      graph: GRAFO_BOM,
    });

    expect(salva.graph.edges).toHaveLength(1);
  });

  /** O motivo da recusa sobe junto: "grafo inválido" sem dizer o quê não conserta nada. */
  it('grafo com ciclo sem espera é recusado, dizendo qual é o problema', async () => {
    const d = deps();
    const criada = await comAutomacao(d);
    const laco: AutomationGraph = {
      nodes: [
        GRAFO_BOM.nodes[0]!,
        { id: 'a1', kind: 'action', type: 'send_message', config: {}, position: { x: 0, y: 60 } },
      ],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'a1' },
        { id: 'e2', from: 'a1', port: 'next', to: 'a1' },
      ],
    };

    await expect(
      saveAutomationGraph(d, ctxCom('owner'), { automationId: criada.id, graph: laco }),
    ).rejects.toMatchObject({ code: 'invalid_graph', message: expect.stringContaining('ciclo') });
  });

  it('automação de outro tenant responde como se não existisse', async () => {
    const d = deps();
    const criada = await comAutomacao(d);

    await expect(
      saveAutomationGraph(
        d,
        { ...ctxCom('owner'), tenantId: 'tenant-b' },
        { automationId: criada.id, graph: GRAFO_BOM },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  /**
   * Mexer no desenho de uma automação ligada é mudar o que já está agindo sobre clientes. A
   * regra é desligar antes: quem edita vê a mudança valer no ato seguinte, não no meio de uma
   * execução em andamento.
   */
  it('não dá para editar o desenho com a automação ligada', async () => {
    const d = deps();
    const criada = await comAutomacao(d);
    await saveAutomationGraph(d, ctxCom('owner'), { automationId: criada.id, graph: GRAFO_BOM });
    await setAutomationEnabled(d, ctxCom('owner'), { automationId: criada.id, enabled: true });

    await expect(
      saveAutomationGraph(d, ctxCom('owner'), { automationId: criada.id, graph: GRAFO_BOM }),
    ).rejects.toMatchObject({ code: 'automation_enabled' });
  });
});

describe('AU-02 · AU-03: ligar e desligar', () => {
  it('ligar guarda quem passa a responder pela automação', async () => {
    const d = deps();
    const criada = await comAutomacao(d);
    await saveAutomationGraph(d, ctxCom('owner'), { automationId: criada.id, graph: GRAFO_BOM });

    const ligada = await setAutomationEnabled(d, ctxCom('owner'), {
      automationId: criada.id,
      enabled: true,
    });

    expect(ligada).toMatchObject({ enabled: true, runAsUserId: 'u-ana' });
  });

  /** Ligar um desenho quebrado seria ligar uma automação que falha na primeira mensagem. */
  it('não liga com o desenho inválido', async () => {
    const d = deps();
    const criada = await comAutomacao(d);

    await expect(
      setAutomationEnabled(d, ctxCom('owner'), { automationId: criada.id, enabled: true }),
    ).rejects.toMatchObject({ code: 'invalid_graph' });
  });

  it('desligar não exige desenho válido — parar tem que ser sempre possível', async () => {
    const d = deps();
    const criada = await comAutomacao(d);
    await saveAutomationGraph(d, ctxCom('owner'), { automationId: criada.id, graph: GRAFO_BOM });
    await setAutomationEnabled(d, ctxCom('owner'), { automationId: criada.id, enabled: true });

    const desligada = await setAutomationEnabled(d, ctxCom('owner'), {
      automationId: criada.id,
      enabled: false,
    });

    expect(desligada.enabled).toBe(false);
  });

  it('ligar e desligar ficam na trilha — é ação com consequência sobre clientes', async () => {
    const d = deps();
    const criada = await comAutomacao(d);
    await saveAutomationGraph(d, ctxCom('owner'), { automationId: criada.id, graph: GRAFO_BOM });

    await setAutomationEnabled(d, ctxCom('owner'), { automationId: criada.id, enabled: true });

    expect(d.audit.rows.map((e) => e.action)).toContain('automation.enable');
  });

  it('operator não liga nem desliga', async () => {
    const d = deps();
    const criada = await comAutomacao(d);

    await expect(
      setAutomationEnabled(d, ctxCom('operator'), { automationId: criada.id, enabled: true }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('AU-10: ler e apagar', () => {
  it('a lista traz as do tenant', async () => {
    const d = deps();
    await comAutomacao(d);

    expect(await listAutomations(d, ctxCom('operator'))).toHaveLength(1);
  });

  it('operator lê — quem atende precisa saber o que responde sozinho', async () => {
    const d = deps();
    const criada = await comAutomacao(d);

    expect(await getAutomation(d, ctxCom('operator'), { automationId: criada.id })).toMatchObject({
      id: criada.id,
    });
  });

  it('cliente não lê nem lista', async () => {
    const d = deps();
    await comAutomacao(d);

    await expect(listAutomations(d, cliente)).rejects.toBeInstanceOf(ForbiddenError);
  });

  /** Exclusão lógica: o que já rodou deixou rastro, e o "por quê" precisa continuar existindo. */
  it('apagar some da lista sem tirar o histórico do banco', async () => {
    const d = deps();
    const criada = await comAutomacao(d);

    await deleteAutomation(d, ctxCom('owner'), { automationId: criada.id });

    expect(await listAutomations(d, ctxCom('owner'))).toHaveLength(0);
    expect(d.automations.rows[0]?.deletedAt).not.toBeNull();
  });

  it('não apaga automação ligada — desligar primeiro é a decisão consciente', async () => {
    const d = deps();
    const criada = await comAutomacao(d);
    await saveAutomationGraph(d, ctxCom('owner'), { automationId: criada.id, graph: GRAFO_BOM });
    await setAutomationEnabled(d, ctxCom('owner'), { automationId: criada.id, enabled: true });

    await expect(
      deleteAutomation(d, ctxCom('owner'), { automationId: criada.id }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

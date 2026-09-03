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
  return createAutomation(d, ctxCom(role), { name: 'Responder quem pergunta preço' });
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

  /**
   * AU-14 — criar pede o nome e nada mais.
   *
   * O gatilho é um bloco do quadro como qualquer outro, e escolher qual é já é desenhar. Pedir
   * essa escolha num formulário, antes de a pessoa ver o quadro, é decidir a regra sem ver o
   * fluxo — e depois não deixar trocar de ideia sem apagar tudo e recomeçar.
   */
  it('nasce com o quadro vazio e sem gatilho — quem escolhe é o desenho', async () => {
    const d = deps();

    const criada = await comAutomacao(d);

    expect(criada.graph.nodes).toHaveLength(0);
    expect(criada.triggerType).toBeNull();
  });

  it('nome em branco é recusado', async () => {
    const d = deps();

    await expect(createAutomation(d, ctxCom('owner'), { name: '   ' })).rejects.toBeInstanceOf(
      RequiredFieldError,
    );
  });

  it('nome repetido é recusado — dois iguais viram engano na conversa da equipe', async () => {
    const d = deps();
    await comAutomacao(d);

    await expect(comAutomacao(d)).rejects.toMatchObject({ code: 'duplicate_automation' });
  });

  it('operator não cria: automação age com poder de quem a liga', async () => {
    await expect(
      createAutomation(deps(), ctxCom('operator'), { name: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não chega aqui (AU-10)', async () => {
    await expect(createAutomation(deps(), cliente, { name: 'X' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
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

/**
 * AU-13 — automação que toca dinheiro pede confirmação à parte.
 *
 * Confirmar inscrição sem pagamento é decisão que muda o financeiro: a vaga passa a estar
 * ocupada e o relatório passa a contar aquela receita. Uma pessoa fazendo isso na tela vê o
 * que está fazendo; uma automação fazendo sozinha, de madrugada, trinta vezes, não tem esse
 * momento. O aviso explícito é onde ele é reposto.
 *
 * Não é burocracia: é a mesma cautela de excluir recebimento (IN-09), aplicada a algo que vai
 * acontecer sem ninguém olhando.
 */
describe('AU-13: ligar automação que toca dinheiro', () => {
  const COM_DINHEIRO: AutomationGraph = {
    nodes: [
      GRAFO_BOM.nodes[0]!,
      {
        id: 'a1',
        kind: 'action',
        type: 'confirm_booking',
        config: {},
        position: { x: 0, y: 60 },
      },
    ],
    edges: [{ id: 'e1', from: 'g1', port: 'next', to: 'a1' }],
  };

  it('recusa sem a confirmação explícita, dizendo o que ela vai fazer sozinha', async () => {
    const d = deps();
    const criada = await comAutomacao(d);
    await saveAutomationGraph(d, ctxCom('owner'), { automationId: criada.id, graph: COM_DINHEIRO });

    await expect(
      setAutomationEnabled(d, ctxCom('owner'), { automationId: criada.id, enabled: true }),
    ).rejects.toMatchObject({ code: 'money_action_confirmation' });
  });

  it('liga com a confirmação dada', async () => {
    const d = deps();
    const criada = await comAutomacao(d);
    await saveAutomationGraph(d, ctxCom('owner'), { automationId: criada.id, graph: COM_DINHEIRO });

    const ligada = await setAutomationEnabled(d, ctxCom('owner'), {
      automationId: criada.id,
      enabled: true,
      confirmMoneyActions: true,
    });

    expect(ligada.enabled).toBe(true);
  });

  /** Automação sem ação de dinheiro liga como sempre: a confirmação não vira ritual de todas. */
  it('automação sem ação de dinheiro não pede confirmação', async () => {
    const d = deps();
    const criada = await comAutomacao(d);
    await saveAutomationGraph(d, ctxCom('owner'), { automationId: criada.id, graph: GRAFO_BOM });

    const ligada = await setAutomationEnabled(d, ctxCom('owner'), {
      automationId: criada.id,
      enabled: true,
    });

    expect(ligada.enabled).toBe(true);
  });

  /** Desligar nunca pede nada: parar tem que ser sempre possível. */
  it('desligar não pede confirmação, mesmo com ação de dinheiro', async () => {
    const d = deps();
    const criada = await comAutomacao(d);
    await saveAutomationGraph(d, ctxCom('owner'), { automationId: criada.id, graph: COM_DINHEIRO });
    await setAutomationEnabled(d, ctxCom('owner'), {
      automationId: criada.id,
      enabled: true,
      confirmMoneyActions: true,
    });

    const desligada = await setAutomationEnabled(d, ctxCom('owner'), {
      automationId: criada.id,
      enabled: false,
    });

    expect(desligada.enabled).toBe(false);
  });
});

/**
 * AU-14 — o gatilho mora no quadro, e a linha só o copia.
 *
 * `triggerType` continua existindo como coluna porque é por ela que cada evento procura, em
 * milissegundos, quem tem interesse — vasculhar `jsonb` a cada mensagem recebida seria caro à
 * toa. Mas a **verdade** é o bloco que a equipe pôs no desenho: a coluna é derivada dele ao
 * salvar, e nunca digitada em outro lugar. Duas fontes para o mesmo fato é como uma automação
 * passa a reagir a um evento que ninguém desenhou.
 */
describe('AU-14: o gatilho vem do quadro', () => {
  const comGatilho = (type: string, config: Record<string, unknown> = {}): AutomationGraph => ({
    nodes: [
      { id: 'g1', kind: 'trigger', type, config, position: { x: 0, y: 0 } },
      { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 120 } },
    ],
    edges: [{ id: 'e1', from: 'g1', port: 'next', to: 'f1' }],
  });

  it('salvar o desenho grava na linha o gatilho que está no quadro', async () => {
    const d = deps();
    const criada = await comAutomacao(d);

    const salva = await saveAutomationGraph(d, ctxCom('owner'), {
      automationId: criada.id,
      graph: comGatilho('opportunity_created'),
    });

    expect(salva.triggerType).toBe('opportunity_created');
  });

  it('trocar o bloco de gatilho troca o gatilho da automação', async () => {
    const d = deps();
    const criada = await comAutomacao(d);
    await saveAutomationGraph(d, ctxCom('owner'), {
      automationId: criada.id,
      graph: comGatilho('message_received'),
    });

    const salva = await saveAutomationGraph(d, ctxCom('owner'), {
      automationId: criada.id,
      graph: comGatilho('booking_confirmed'),
    });

    expect(salva.triggerType).toBe('booking_confirmed');
  });

  /**
   * AU-12 — o "quantos dias antes" é configurado no bloco, no inspetor, como todo o resto.
   * A varredura lê da coluna, então o que o bloco diz precisa chegar lá; senão a equipe
   * desenha "três dias antes" e o motor procura pelo dia da saída.
   */
  it('a configuração do gatilho temporal desce do bloco para a linha', async () => {
    const d = deps();
    const criada = await comAutomacao(d);

    const salva = await saveAutomationGraph(d, ctxCom('owner'), {
      automationId: criada.id,
      graph: comGatilho('scheduled', { offsetDays: -3 }),
    });

    expect(salva.triggerConfig).toEqual({ offsetDays: -3 });
  });

  it('desenho sem gatilho nenhum é recusado, e a linha continua sem gatilho', async () => {
    const d = deps();
    const criada = await comAutomacao(d);

    await expect(
      saveAutomationGraph(d, ctxCom('owner'), {
        automationId: criada.id,
        graph: { nodes: [], edges: [] },
      }),
    ).rejects.toMatchObject({ code: 'invalid_graph' });
    expect((await getAutomation(d, ctxCom('owner'), { automationId: criada.id })).triggerType).toBe(
      null,
    );
  });

  it('sem gatilho no quadro, não liga', async () => {
    const d = deps();
    const criada = await comAutomacao(d);

    await expect(
      setAutomationEnabled(d, ctxCom('owner'), { automationId: criada.id, enabled: true }),
    ).rejects.toMatchObject({ code: 'invalid_graph' });
  });
});

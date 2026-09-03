import {
  evaluateCondition,
  nextNode,
  renderTemplate,
  resolveDelay,
  resolveSwitch,
  type AutomationGraph,
  type AutomationNode,
  type Port,
  type RunContext,
} from '@expedition/domain';
import type { AutomationRunnerDeps } from './runnerDeps.js';
import type { DueRunRef } from './automationRunRepository.js';
import type { RequestContext } from '../context.js';

/**
 * AU-05 — quantos nós uma execução pode percorrer.
 *
 * O grafo já recusa ciclo sem espera, mas fluxo comprido também anda sozinho. Este é o freio
 * final: se um desenho encontrar um jeito de andar demais, ele para com motivo em vez de girar.
 */
export const TETO_DE_PASSOS = 50;

/** AU-11 — quantas vezes uma falha de provedor pode ser tentada antes de desistir. */
export const TETO_DE_TENTATIVAS = 3;

/** Quanto tempo esperar entre tentativas. Cresce, para não martelar um provedor que caiu. */
const ESPERA_DA_TENTATIVA_MIN = [5, 30, 120];

/**
 * AU-04 · AU-06 — o interpretador.
 *
 * Pega uma execução reivindicada e anda por ela até acabar, até dormir numa espera, ou até
 * falhar. Cada nó por onde passa deixa um passo no log — é o que responde "por que essa
 * mensagem foi enviada para esse cliente?" seis meses depois.
 *
 * O relógio entra como parâmetro. Um motor que lê `new Date()` por dentro não dá para testar
 * numa espera de três dias, e é justamente a espera longa que precisa de prova.
 */
export async function advanceAutomationRun(
  deps: AutomationRunnerDeps,
  ref: DueRunRef,
  now: Date,
): Promise<void> {
  const run = await deps.runs.findById(ref.tenantId, ref.id);
  if (run === null || run.status === 'done' || run.status === 'failed') return;

  const automacao = await deps.automations.findById(ref.tenantId, ref.automationId);
  // Desligada no meio do caminho — inclusive durante uma espera de três dias — é motivo para
  // parar. Continuar seria agir por uma decisão que a equipe já desfez.
  if (automacao === null || !automacao.enabled) {
    await deps.runs.update(ref.tenantId, ref.id, {
      status: 'cancelled',
      lastError: 'a automação foi desligada antes de esta execução terminar',
      release: true,
    });
    return;
  }

  // AU-03: o papel é relido **agora**, não o que foi guardado quando a automação foi ligada.
  const ctx = await contextoDeQuemLigou(deps, ref.tenantId, automacao.runAsUserId);
  if (ctx === null) {
    await deps.runs.update(ref.tenantId, ref.id, {
      status: 'failed',
      lastError: 'quem ligou esta automação não tem mais acesso ao sistema',
      release: true,
    });
    return;
  }

  const variaveis: RunContext = { ...run.variables };
  let passos = run.stepsTaken;
  let atual = proximoNo(automacao.graph, run.currentNodeId);

  while (atual !== null) {
    if (passos >= TETO_DE_PASSOS) {
      await deps.runs.update(ref.tenantId, ref.id, {
        status: 'failed',
        variables: variaveis,
        stepsTaken: passos,
        lastError: `a execução passou de ${String(TETO_DE_PASSOS)} passos e foi interrompida`,
        release: true,
      });
      return;
    }
    passos += 1;

    // A espera não é um passo que se executa: é onde a execução dorme. Guarda o **próximo**
    // nó, para acordar continuando em vez de refazer o que já rodou.
    if (atual.kind === 'delay') {
      const depois = nextNode(automacao.graph, atual.id, 'next');
      await registrar(deps, ref, atual, 'espera', { ate: resolveDelay(atual.config, now) });
      await deps.runs.update(ref.tenantId, ref.id, {
        status: 'waiting',
        currentNodeId: depois?.id ?? null,
        variables: variaveis,
        stepsTaken: passos,
        wakeAt: resolveDelay(atual.config, now),
        release: true,
      });
      return;
    }

    if (atual.kind === 'end') {
      await registrar(deps, ref, atual, 'fim', {});
      await deps.runs.update(ref.tenantId, ref.id, {
        status: 'done',
        currentNodeId: null,
        variables: variaveis,
        stepsTaken: passos,
        release: true,
      });
      return;
    }

    let porta: Port = 'next';

    if (atual.kind === 'condition') {
      porta = evaluateCondition(atual.config, variaveis) ? 'true' : 'false';
      await registrar(deps, ref, atual, porta, { campo: atual.config['field'] });
    } else if (atual.kind === 'switch') {
      // AU-15: a porta escolhida é o que o log guarda. "Por que este cliente recebeu a
      // mensagem do outro roteiro?" só tem resposta se o desvio ficar escrito.
      porta = resolveSwitch(atual.config, variaveis);
      await registrar(deps, ref, atual, porta, { campo: atual.config['field'] });
    } else if (atual.kind === 'setVariable') {
      const nome = String(atual.config['name'] ?? '').trim();
      const valor = renderTemplate(String(atual.config['value'] ?? ''), variaveis);
      if (nome !== '') variaveis[nome] = valor;
      await registrar(deps, ref, atual, 'definiu', { [nome]: valor });
    } else if (atual.kind === 'action') {
      const erro = await executarAcao(deps, ref, atual, ctx, variaveis, now, run.attempts, passos);
      if (erro) return;
    } else {
      // O gatilho não faz nada: ele é a porta de entrada, e já foi cumprido quando o evento
      // aconteceu. Fica no log para o fluxo ser legível de ponta a ponta.
      await registrar(deps, ref, atual, 'disparou', run.triggerRef);
    }

    atual = nextNode(automacao.graph, atual.id, porta);
  }

  // Ramo que acaba sem bloco de fim: acabou do mesmo jeito.
  await deps.runs.update(ref.tenantId, ref.id, {
    status: 'done',
    currentNodeId: null,
    variables: variaveis,
    stepsTaken: passos,
    release: true,
  });
}

/**
 * Executa uma ação e trata a falha. Devolve `true` quando a execução foi encerrada aqui — por
 * erro, por ação desconhecida ou por tentativas esgotadas — e o laço deve parar.
 */
async function executarAcao(
  deps: AutomationRunnerDeps,
  ref: DueRunRef,
  no: AutomationNode,
  ctx: RequestContext,
  variaveis: RunContext,
  now: Date,
  tentativasAnteriores: number,
  passos: number,
): Promise<boolean> {
  const acao = deps.actions[no.type];
  if (acao === undefined) {
    // Ação que o registro não conhece é grafo salvo por uma versão que este servidor não tem.
    // Falhar dizendo qual é o nome é o que permite consertar; sumir em silêncio, não.
    await registrar(deps, ref, no, 'erro', { motivo: 'ação desconhecida' });
    await deps.runs.update(ref.tenantId, ref.id, {
      status: 'failed',
      variables: variaveis,
      stepsTaken: passos,
      lastError: `este servidor não conhece a ação "${no.type}"`,
      release: true,
    });
    return true;
  }

  try {
    const detalhe = await acao({
      ctx,
      // AU-09: o texto vai para a ação com as variáveis já trocadas. Marcador cru nunca
      // chega na cara do cliente.
      config: comTextoResolvido(no.config, variaveis),
      variables: variaveis,
    });
    await registrar(deps, ref, no, 'fez', detalhe);
    return false;
  } catch (error) {
    const motivo = motivoDe(error);
    const tentativas = tentativasAnteriores + 1;
    await registrar(deps, ref, no, 'erro', { motivo });

    if (tentativas >= TETO_DE_TENTATIVAS) {
      await deps.runs.update(ref.tenantId, ref.id, {
        status: 'failed',
        variables: variaveis,
        stepsTaken: passos,
        attempts: tentativas,
        lastError: motivo,
        release: true,
      });
      return true;
    }

    // Volta para a fila, e mais tarde a cada vez: martelar um provedor que caiu não o levanta.
    const espera = ESPERA_DA_TENTATIVA_MIN[tentativas - 1] ?? 120;
    await deps.runs.update(ref.tenantId, ref.id, {
      status: 'pending',
      // Repete **este** nó: a ação não chegou a acontecer.
      currentNodeId: no.id,
      variables: variaveis,
      stepsTaken: passos,
      attempts: tentativas,
      wakeAt: new Date(now.getTime() + espera * 60_000),
      lastError: motivo,
      release: true,
    });
    return true;
  }
}

/** Onde a execução retoma. `null` quer dizer que ela nunca entrou: começa pelo gatilho. */
function proximoNo(graph: AutomationGraph, currentNodeId: string | null): AutomationNode | null {
  if (currentNodeId === null) return nextNode(graph, null, 'next');
  return graph.nodes.find((no) => no.id === currentNodeId) ?? null;
}

/**
 * AU-03 — monta o contexto com o papel **vigente** de quem ligou a automação. `null` quando
 * essa pessoa perdeu o acesso: a automação não age por procuração de quem saiu.
 */
async function contextoDeQuemLigou(
  deps: AutomationRunnerDeps,
  tenantId: string,
  runAsUserId: string | null,
): Promise<RequestContext | null> {
  if (runAsUserId === null) return null;
  const vinculo = await deps.memberships.findByUser(tenantId, runAsUserId);
  if (vinculo === null) return null;
  return { tenantId, actor: { kind: 'team', userId: runAsUserId, role: vinculo.role } };
}

/** Troca `{{contato.nome}}` em todo campo de texto da configuração, antes de a ação ver. */
function comTextoResolvido(
  config: Record<string, unknown>,
  variaveis: RunContext,
): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(config)) {
    saida[chave] = typeof valor === 'string' ? renderTemplate(valor, variaveis) : valor;
  }
  return saida;
}

async function registrar(
  deps: AutomationRunnerDeps,
  ref: DueRunRef,
  no: AutomationNode,
  outcome: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await deps.steps.record({
    tenantId: ref.tenantId,
    runId: ref.id,
    nodeId: no.id,
    kind: no.kind,
    outcome,
    detail,
  });
}

/**
 * O motivo da falha, em texto que sirva para alguém consertar.
 *
 * Erro de negócio deste sistema carrega `code` e às vezes mensagem vazia — e um `lastError`
 * em branco na tela é pior que nenhum log: a pessoa vê que falhou e não tem por onde começar.
 * Por isso o código entra quando a mensagem não diz nada.
 */
function motivoDe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const codigo = 'code' in error ? String((error as { code: unknown }).code) : '';
  if (error.message.trim() !== '') {
    return codigo === '' ? error.message : `${error.message} (${codigo})`;
  }
  return codigo === '' ? error.name : codigo;
}

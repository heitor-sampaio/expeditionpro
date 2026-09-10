import { requireTeam } from '../audience.js';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { buildBookingContext, type BuildBookingContextDeps } from './buildBookingContext.js';
import type { RunContext } from '@expedition/domain';
import type { RequestContext } from '../context.js';
import type { AutomationRunRepository } from './automationRunRepository.js';

/**
 * AU-25 — de onde sai o contexto de um ensaio.
 *
 * Ensaiar exigia **digitar** cada campo do gatilho. Depois que os gatilhos de inscrição
 * passaram a trazer contato, saída e dinheiro (AU-16), isso virou dezoito caixas de texto para
 * preencher antes de ver qualquer coisa — e ninguém confere um fluxo assim: inventa três
 * valores, erra o quarto, e tira conclusão sobre uma automação que nunca vai receber esses
 * dados.
 *
 * Aqui a pessoa escolhe uma inscrição **de verdade** e o contexto sai da mesma função que a
 * borda usa no gatilho. É o que faz o ensaio responder pelo que a execução real teria: um
 * montador só, e não uma segunda verdade parecida.
 *
 * Fica separado de `simulateAutomationRun` de propósito. O motor não sabe o que é uma
 * inscrição — sabe percorrer um grafo com um contexto —, e é esse desenho que deixa o
 * interpretador fora do caminho de cada entidade nova (AU-08).
 */

export type SampleSource =
  | { readonly kind: 'inscricao'; readonly bookingId: string }
  /**
   * AU-25 — uma execução que já aconteceu.
   *
   * Resolve outra pergunta que a inscrição: escolher uma inscrição responde "o que este fluxo
   * faria com esta família?"; escolher uma execução responde **"por que ele fez o que fez
   * naquele dia?"** — a pergunta de quem está investigando uma mensagem errada.
   */
  | { readonly kind: 'execucao'; readonly runId: string; readonly automationId: string }
  /** AU-17: o gatilho de tempo não pende de entidade nenhuma — o contexto dele é o relógio. */
  | { readonly kind: 'agora' };

export interface BuildSampleContextDeps extends BuildBookingContextDeps {
  readonly runs: AutomationRunRepository;
}

export interface BuildSampleContextCommand {
  readonly source: SampleSource;
  readonly now: Date;
}

export async function buildSampleContext(
  deps: BuildSampleContextDeps,
  ctx: RequestContext,
  command: BuildSampleContextCommand,
): Promise<RunContext> {
  // Ensaiar mostra dado de cliente — o nome, o telefone, quanto a família deve. É guarda de
  // equipe pela mesma razão que ler o log da automação é, e inclui o viewer: nada é executado.
  requireTeam(ctx);

  if (command.source.kind === 'agora') return { agora: relogio(command.now) };
  if (command.source.kind === 'execucao') return contextoDaExecucao(deps, ctx, command.source);

  const { bookingId } = command.source;
  /*
   * **Aqui o silêncio seria erro**, e é o contrário do que o gatilho faz.
   *
   * Na borda, inscrição não encontrada degrada para o id e a automação segue — perder o
   * gatilho seria pior. No ensaio, quem escolheu uma inscrição numa lista precisa saber que ela
   * sumiu: senão lê um fluxo inteiro com o contexto vazio, achando que o desenho é que está
   * errado.
   */
  const inscricao = await deps.bookings.findById(ctx.tenantId, bookingId);
  if (inscricao === null) throw new NotFoundError('inscrição');

  return buildBookingContext(deps, ctx, { bookingId });
}

/**
 * AU-25 — o contexto que o gatilho entregou numa execução que já aconteceu.
 *
 * Sai de `triggerVariables`, e **nunca** de `variables`: o motor sobrescreve `variables` a cada
 * passo, então ela guarda o estado do meio do caminho. Ensaiar em cima dela mostraria as
 * variáveis que o próprio fluxo definiu como se tivessem vindo do gatilho — com a cara de ser
 * fiel à execução, e não sendo.
 */
async function contextoDaExecucao(
  deps: BuildSampleContextDeps,
  ctx: RequestContext,
  source: { readonly runId: string; readonly automationId: string },
): Promise<RunContext> {
  const execucao = await deps.runs.findById(ctx.tenantId, source.runId);
  /*
   * A execução tem que ser **desta** automação. Sem esta checagem dá para ensaiar o desenho de
   * uma com os dados de outra: a resposta parece legítima e é sobre uma coisa que nunca houve.
   */
  if (execucao === null || execucao.automationId !== source.automationId) {
    throw new NotFoundError('execução');
  }
  /*
   * Execução anterior à coluna não tem o retrato do começo, e remendar com `variables` seria
   * oferecer o estado final vestido de inicial. Recusar é o honesto — e a lista de execuções já
   * mostra essas desabilitadas, com o motivo à vista.
   */
  if (execucao.triggerVariables === null) {
    throw new BusinessRuleError(
      'run_sem_contexto',
      'Esta execução é anterior ao registro do contexto do gatilho — escolha uma mais recente.',
    );
  }
  return execucao.triggerVariables;
}

/**
 * A data e a hora como o contexto as promete (AU-16), no fuso da operação.
 *
 * A expedição é no Brasil e o servidor roda em UTC: sem o deslocamento, um ensaio das 21:00
 * anunciaria a data de amanhã para quem está olhando hoje.
 */
function relogio(now: Date): { data: string; hora: string } {
  const local = new Date(now.getTime() - 3 * 3_600_000).toISOString();
  return { data: local.slice(0, 10), hora: local.slice(11, 16) };
}

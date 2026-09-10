import { requireTeam } from '../audience.js';
import { NotFoundError } from '../errors.js';
import { buildBookingContext, type BuildBookingContextDeps } from './buildBookingContext.js';
import type { RunContext } from '@expedition/domain';
import type { RequestContext } from '../context.js';

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
  /** AU-17: o gatilho de tempo não pende de entidade nenhuma — o contexto dele é o relógio. */
  | { readonly kind: 'agora' };

export interface BuildSampleContextCommand {
  readonly source: SampleSource;
  readonly now: Date;
}

export async function buildSampleContext(
  deps: BuildBookingContextDeps,
  ctx: RequestContext,
  command: BuildSampleContextCommand,
): Promise<RunContext> {
  // Ensaiar mostra dado de cliente — o nome, o telefone, quanto a família deve. É guarda de
  // equipe pela mesma razão que ler o log da automação é, e inclui o viewer: nada é executado.
  requireTeam(ctx);

  if (command.source.kind === 'agora') return { agora: relogio(command.now) };

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
 * A data e a hora como o contexto as promete (AU-16), no fuso da operação.
 *
 * A expedição é no Brasil e o servidor roda em UTC: sem o deslocamento, um ensaio das 21:00
 * anunciaria a data de amanhã para quem está olhando hoje.
 */
function relogio(now: Date): { data: string; hora: string } {
  const local = new Date(now.getTime() - 3 * 3_600_000).toISOString();
  return { data: local.slice(0, 10), hora: local.slice(11, 16) };
}

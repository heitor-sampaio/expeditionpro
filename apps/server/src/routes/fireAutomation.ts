import {
  buildBookingContext,
  type RequestContext,
  type TriggerType,
} from '@expedition/application';
import type { EnqueueAutomationRunCommand } from '@expedition/application';
import type { RunContext } from '@expedition/domain';
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../buildServer.js';

/**
 * AU-04 · AU-05 — o gatilho, na borda.
 *
 * Está aqui, e não dentro dos casos de uso, por uma razão de desenho e não de arrumação: **os
 * gatilhos nascem na borda HTTP e o motor chama os casos de uso direto**. Uma ação de automação
 * nunca passa por rota, então nunca dispara outra automação — a classe inteira de "automação
 * que se alimenta" deixa de existir, sem teto, sem detector de laço e sem contador.
 *
 * É best-effort, no molde exato do `fireBookingNotification`: dispara e volta. A operação de
 * negócio já concluiu, e um problema na automação não pode desfazê-la nem atrasá-la.
 */
export function fireAutomation(
  app: FastifyInstance,
  tenantId: string,
  triggerType: TriggerType,
  triggerRef: Record<string, unknown>,
  variables: Record<string, unknown>,
  /** AU-21: quando o tipo não basta para escolher quem acorda — o nome do gancho, por exemplo. */
  matchConfig?: Record<string, unknown>,
): void {
  const command: EnqueueAutomationRunCommand = {
    tenantId,
    triggerType,
    triggerRef,
    variables,
    ...(matchConfig === undefined ? {} : { matchConfig }),
    now: new Date(),
  };
  app.automations.fire(command);
}

/** O recebimento que acabou de entrar, do jeito que o gatilho o apresenta (AU-16). */
export interface PagamentoDoGatilho {
  /**
   * PG-08: o valor que **quita** a inscrição, nunca o que o cliente pagou. Com a taxa
   * repassada os dois divergem, e `inscricao.recebidoCents` é a soma do ledger — mandar o
   * bruto aqui faria "recebemos X, faltam Y" não fechar, pela diferença exata da taxa.
   */
  readonly valorCents: number;
  readonly metodo: string;
  /** `aaaa-mm-dd`, como toda data no contexto. */
  readonly data: string;
  /** IN-08: este recebimento foi o que tirou a inscrição de pendente? */
  readonly confirmou: boolean;
}

/**
 * O acontecimento de inscrição que se quer disparar.
 *
 * União discriminada, e não um saco de campos opcionais: assim o motivo do cancelamento é
 * **exigido** pelo compilador em quem cancela, e não um campo que alguém esquece de passar
 * para descobrir seis meses depois, pela mensagem que saiu sem ele.
 */
export type BookingTrigger =
  | { readonly tipo: 'booking_created' }
  | { readonly tipo: 'booking_confirmed' }
  | { readonly tipo: 'booking_cancelled'; readonly motivo: string }
  | { readonly tipo: 'payment_registered'; readonly pagamento: PagamentoDoGatilho };

/**
 * AU-16 — dispara os gatilhos de uma inscrição, com o contexto cheio.
 *
 * **A montagem roda fora do caminho da resposta**, e por três razões que se somam: a alocação
 * pela fila acontece dentro de uma transação (§5.7.2) e ler ali seria ler o que ainda não
 * commitou; AU-04 exige que a borda responda em milissegundos; e ler **depois** é o que faz o
 * gatilho de pagamento enxergar o recebimento que acabou de entrar — sem isso o saldo sairia
 * o de antes, e a conta não fecharia na cara do cliente.
 *
 * **Uma leitura, N gatilhos.** A rota de pagamento dispara dois; montar duas vezes dobraria as
 * consultas e faria a ordem de enfileiramento depender de qual consulta voltou primeiro. Quem
 * precisa de ordem entre duas mensagens põe uma espera no desenho — não é aqui que isso se
 * resolve.
 */
export function fireBookingAutomations(
  app: FastifyInstance,
  deps: ServerDeps,
  ctx: RequestContext,
  bookingId: string,
  gatilhos: readonly BookingTrigger[],
): void {
  // O motor desligado não paga leitura nenhuma: sem isto, toda alocação e todo pagamento
  // fariam três consultas para alimentar um motor que não vai enfileirar nada.
  if (!app.automations.enabled || gatilhos.length === 0) return;

  void buildBookingContext(deps, ctx, { bookingId })
    .then((base) => {
      for (const gatilho of gatilhos) {
        fireAutomation(app, ctx.tenantId, gatilho.tipo, { bookingId }, comExtras(base, gatilho));
      }
    })
    .catch((error: unknown) => {
      // Sem o contexto no log: ele carrega telefone e e-mail do cliente.
      app.log.warn(
        { err: error, bookingId, gatilhos: gatilhos.map((gatilho) => gatilho.tipo) },
        'contexto do gatilho de inscrição falhou (best-effort)',
      );
    });
}

/** O que cada gatilho acrescenta ao contexto comum da inscrição. */
function comExtras(base: RunContext, gatilho: BookingTrigger): RunContext {
  const inscricao = (base['inscricao'] ?? {}) as Record<string, unknown>;
  switch (gatilho.tipo) {
    case 'booking_cancelled':
      // AU-17: "cancelou por desistência" e "cancelou por chuva" pedem reações diferentes.
      return { ...base, inscricao: { ...inscricao, motivo: gatilho.motivo } };
    case 'payment_registered':
      return { ...base, pagamento: { ...gatilho.pagamento } };
    default:
      return base;
  }
}

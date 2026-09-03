import type { EnqueueAutomationRunCommand, TriggerType } from '@expedition/application';
import type { FastifyInstance } from 'fastify';

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
): void {
  const command: EnqueueAutomationRunCommand = {
    tenantId,
    triggerType,
    triggerRef,
    variables,
    now: new Date(),
  };
  app.automations.fire(command);
}

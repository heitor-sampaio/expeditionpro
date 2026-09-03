import { addDays, compareLocalDate, type LocalDate } from '@expedition/domain';
import { enqueueAutomationRun } from './enqueueAutomationRun.js';
import type { AutomationRunnerDeps } from './runnerDeps.js';
import type { ScheduleEventWithGroup } from '../schedule/scheduleRepository.js';

/**
 * O segundo — e último — caminho sem escopo de tenant do sistema: quais automações temporais
 * estão ligadas, em qualquer tenant. Devolve id, tenant e o deslocamento em dias, e nada mais.
 */
export interface ScheduledAutomationRef {
  readonly tenantId: string;
  readonly automationId: string;
  /** Negativo é antes da saída; positivo é depois. */
  readonly offsetDays: number;
}

export interface ScanScheduledTriggersDeps extends AutomationRunnerDeps {
  readonly schedule: { listEvents(tenantId: string): Promise<ScheduleEventWithGroup[]> };
}

export interface ScanScheduledTriggersCommand {
  /** O dia de hoje, no fuso da operação. Entra como parâmetro: varredura não lê relógio. */
  readonly today: LocalDate;
  readonly now: Date;
}

/**
 * AU-12 — o gatilho temporal.
 *
 * Varre em vez de agendar. Um despertador marcado para as 9:00 perde o disparo se o processo
 * estiver reiniciando naquele instante; "quais saídas começam daqui a três dias?" continua
 * verdadeiro às 9:05, e no dia seguinte também. O preço é passar de novo pela mesma saída —
 * e é a chave de idempotência, não a precisão do relógio, que garante uma execução só.
 *
 * A agenda de um tenant só é lida quando **existe** automação temporal ligada nele: sem
 * nenhuma, esta função não toca em dado de ninguém.
 */
export async function scanScheduledTriggers(
  deps: ScanScheduledTriggersDeps,
  command: ScanScheduledTriggersCommand,
): Promise<number> {
  const temporais = await deps.automations.listScheduledAcrossTenants();
  if (temporais.length === 0) return 0;

  // Uma leitura de agenda por tenant, e não uma por automação: dois lembretes no mesmo tenant
  // não justificam varrer a agenda duas vezes.
  const agendaPorTenant = new Map<string, ScheduleEventWithGroup[]>();
  let abertas = 0;

  for (const alvo of temporais) {
    const automacao = await deps.automations.findById(alvo.tenantId, alvo.automationId);
    if (automacao === null || !automacao.enabled) continue;

    let agenda = agendaPorTenant.get(alvo.tenantId);
    if (agenda === undefined) {
      agenda = await deps.schedule.listEvents(alvo.tenantId);
      agendaPorTenant.set(alvo.tenantId, agenda);
    }

    // "Três dias antes da saída" visto de hoje: a saída que procuramos começa hoje + 3.
    const alvoDaData = addDays(command.today, -alvo.offsetDays);

    for (const { event, group } of agenda) {
      if (compareLocalDate(event.startDate, alvoDaData) !== 0) continue;

      const criadas = await enqueueAutomationRun(deps, {
        tenantId: alvo.tenantId,
        triggerType: 'scheduled',
        triggerRef: { scheduleEventId: event.id, groupId: group.id },
        variables: { saida: { nome: group.name, inicio: isoDe(event.startDate) } },
        // A chave que impede o segundo disparo. O deslocamento entra nela porque duas
        // automações podem olhar a mesma saída em dias diferentes.
        idempotencyKey: `${event.id}:${String(alvo.offsetDays)}`,
        now: command.now,
      });
      abertas += criadas.length;
    }
  }

  return abertas;
}

function isoDe(data: LocalDate): string {
  const mes = String(data.month).padStart(2, '0');
  const dia = String(data.day).padStart(2, '0');
  return `${String(data.year)}-${mes}-${dia}`;
}

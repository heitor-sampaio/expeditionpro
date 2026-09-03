import type { AutomationGraph } from '@expedition/domain';
import type { ScheduledAutomationRef } from './scanScheduledTriggers.js';

/**
 * §5.18 — a automação guardada.
 *
 * O grafo entra e sai como dado: quem valida é o domínio, quem guarda é isto. `triggerType`
 * vive fora do grafo porque é por ele que o gatilho procura, a cada evento, quem tem interesse
 * — e uma consulta por dentro de `jsonb` a cada mensagem recebida seria cara à toa.
 */

export type TriggerType =
  | 'message_received'
  | 'conversation_created'
  | 'opportunity_created'
  | 'opportunity_moved'
  | 'booking_created'
  | 'booking_confirmed'
  | 'payment_registered'
  /** AU-12: em relação à data de início de uma saída. É varrido, não agendado. */
  | 'scheduled';

export interface AutomationRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly triggerType: TriggerType;
  /** AU-12: `{ offsetDays }` no temporal. Os gatilhos de evento não têm o que configurar. */
  readonly triggerConfig: Record<string, unknown>;
  readonly graph: AutomationGraph;
  readonly enabled: boolean;
  /** AU-03: quem responde pela automação. `null` enquanto ela nunca foi ligada. */
  readonly runAsUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewAutomation {
  readonly tenantId: string;
  readonly name: string;
  readonly description: string | null;
  readonly triggerType: TriggerType;
  readonly triggerConfig: Record<string, unknown>;
  readonly graph: AutomationGraph;
  readonly createdBy: string | null;
}

export interface AutomationPatch {
  readonly name?: string;
  readonly description?: string | null;
  readonly triggerConfig?: Record<string, unknown>;
  readonly graph?: AutomationGraph;
  readonly enabled?: boolean;
  readonly runAsUserId?: string | null;
}

export interface AutomationRepository {
  /** Só as vivas: a exclusão é lógica, e o histórico do que rodou continua no banco. */
  list(tenantId: string): Promise<AutomationRecord[]>;
  findById(tenantId: string, id: string): Promise<AutomationRecord | null>;
  findByName(tenantId: string, name: string): Promise<AutomationRecord | null>;
  create(automation: NewAutomation): Promise<AutomationRecord>;
  update(tenantId: string, id: string, patch: AutomationPatch): Promise<AutomationRecord>;
  softDelete(tenantId: string, id: string): Promise<void>;

  /**
   * AU-12 — o segundo e último caminho **sem escopo de tenant** do sistema: quais automações
   * temporais estão ligadas, em qualquer tenant. O motor roda fora de requisição e precisa
   * saber onde procurar; devolve id, tenant e o deslocamento em dias, e nada mais. Ler a
   * agenda de cada um continua sendo pelo client escopado.
   */
  listScheduledAcrossTenants(): Promise<readonly ScheduledAutomationRef[]>;
}

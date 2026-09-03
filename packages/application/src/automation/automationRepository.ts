import type { AutomationGraph, TriggerType } from '@expedition/domain';

/**
 * AU-12 · AU-17 — o achado sem escopo de tenant, reduzido ao mínimo: onde procurar e o que o
 * gatilho pede. Quem lê a agenda, ou monta o contexto, volta ao client escopado.
 */
export interface TimeTriggerRef {
  readonly tenantId: string;
  readonly automationId: string;
  readonly triggerType: TriggerType;
  readonly triggerConfig: Record<string, unknown>;
}

/**
 * §5.18 — a automação guardada.
 *
 * O grafo entra e sai como dado: quem valida é o domínio, quem guarda é isto. `triggerType`
 * vive fora do grafo porque é por ele que o gatilho procura, a cada evento, quem tem interesse
 * — e uma consulta por dentro de `jsonb` a cada mensagem recebida seria cara à toa. AU-14: é
 * **cópia** do bloco de gatilho do desenho, derivada ao salvar, nunca escolhida à parte.
 */

export type { TriggerType };

export interface AutomationRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  /** AU-14: `null` enquanto o quadro ainda não tem bloco de gatilho. Rascunho não liga. */
  readonly triggerType: TriggerType | null;
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
  readonly graph: AutomationGraph;
  readonly createdBy: string | null;
}

export interface AutomationPatch {
  readonly name?: string;
  readonly description?: string | null;
  readonly triggerType?: TriggerType | null;
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
   * AU-12 · AU-17 — o segundo e último caminho **sem escopo de tenant** do sistema: quais
   * automações de gatilho temporal estão ligadas, em qualquer tenant.
   *
   * O motor roda fora de requisição e precisa saber onde procurar. Devolve id, tenant, o tipo
   * do gatilho e a configuração dele — e nada mais. Ler a agenda de cada tenant continua
   * sendo pelo client escopado, com o tenant da própria linha.
   *
   * Os dois gatilhos de tempo passam por aqui, e é de propósito: um achado só mantém em
   * **dois** o número de caminhos sem escopo no sistema inteiro. Um terceiro seria mais uma
   * porta para vigiar.
   */
  listTimeTriggersAcrossTenants(): Promise<readonly TimeTriggerRef[]>;
}

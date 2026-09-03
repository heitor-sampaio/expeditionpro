import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { AutomationRepository } from './automationRepository.js';

/**
 * §5.18 — o que os casos de uso de automação precisam.
 *
 * A trilha entra em todos porque ligar, desligar e apagar uma automação são atos com
 * consequência sobre clientes: quem ligou e quando é pergunta que aparece depois.
 */
export interface AutomationDeps {
  readonly automations: AutomationRepository;
  readonly audit: AuditLogRepository;
}

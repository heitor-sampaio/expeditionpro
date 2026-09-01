import type { FeeSettings } from '@expedition/domain';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import { ASAAS, assertCanManage } from './connectPaymentProvider.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type {
  PaymentEnvironment,
  PaymentIntegrationRepository,
} from './paymentIntegrationRepository.js';

/**
 * PG-04 — o que o provedor **não** informa por API: o custo de antecipar, ao mês. A taxa
 * da transação vem da simulação a cada cobrança (PG-05), então não se digita nem envelhece
 * aqui.
 *
 * Fica junto da conexão, por ambiente — sandbox e produção podem ter condições diferentes.
 */

export interface UpdatePaymentFeesDeps {
  readonly integrations: PaymentIntegrationRepository;
  readonly audit: AuditLogRepository;
}

export interface UpdatePaymentFeesCommand {
  readonly environment: PaymentEnvironment;
  readonly feeSettings: FeeSettings;
}

export async function updatePaymentFees(
  deps: UpdatePaymentFeesDeps,
  ctx: RequestContext,
  command: UpdatePaymentFeesCommand,
): Promise<FeeSettings> {
  assertCanManage(ctx);
  assertSane(command.feeSettings);

  const existing = await deps.integrations.find(ctx.tenantId, ASAAS, command.environment);
  if (!existing) {
    throw new NotFoundError('integração');
  }

  const updated = await deps.integrations.setFeeSettings(
    ctx.tenantId,
    ASAAS,
    command.environment,
    command.feeSettings,
  );

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'payment_integration',
    entityId: existing.id,
    action: 'payment_integration.fees',
    diff: { environment: command.environment, feeSettings: command.feeSettings },
  });

  return updated.feeSettings;
}

/**
 * Barra o que é erro de digitação antes de virar cobrança errada: percentual negativo,
 * taxa fixa negativa, ou percentual absurdo (acima de 100% nada sobra, por definição).
 */
function assertSane(settings: FeeSettings): void {
  for (const rate of [settings.pix, settings.boleto, settings.card]) {
    const monthly = rate?.anticipationMonthlyBps ?? 0;
    if (!Number.isInteger(monthly) || monthly < 0) {
      throw new BusinessRuleError('invalid_fee', 'Taxa inválida: use números inteiros positivos');
    }
    // Antecipação mensal só vira percentual efetivo na cobrança (depende das parcelas);
    // aqui basta barrar o absurdo — 100% ao mês não é taxa, é erro de digitação.
    if (monthly >= 10_000) {
      throw new BusinessRuleError('invalid_fee', 'Taxa de 100% ao mês não é uma taxa');
    }
  }
}

import type { CashbackConfig } from '@expedition/domain';
import { BusinessRuleError, ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CashbackRepository } from './cashbackRepository.js';

/**
 * CB-01/CB-02 — config de cashback da empresa. Regra por percentual **ou** valor fixo
 * e o switch geral do tenant, guardados em `tenant.settings.cashback`. Ler é da equipe;
 * gravar mexe em dinheiro que a empresa passará a dever, então é só owner/admin. As
 * invariantes de faixa são checadas aqui (erro de negócio é tipo, não string).
 */

export interface CashbackConfigDeps {
  readonly cashback: CashbackRepository;
}

export async function getCashbackConfig(
  deps: CashbackConfigDeps,
  ctx: RequestContext,
): Promise<CashbackConfig> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('A configuração de cashback é da equipe');
  }
  return deps.cashback.getConfig(ctx.tenantId);
}

export async function updateCashbackConfig(
  deps: CashbackConfigDeps,
  ctx: RequestContext,
  config: CashbackConfig,
): Promise<CashbackConfig> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Alterar a config de cashback exige owner ou admin');
  }
  validate(config);
  await deps.cashback.saveConfig(ctx.tenantId, config);
  return config;
}

function validate(config: CashbackConfig): void {
  if (config.mode === 'percent' && !inRange(config.value, 0, 100)) {
    throw new BusinessRuleError('invalid_cashback_config', 'Percentual deve estar entre 0 e 100');
  }
  if (config.mode === 'fixed' && config.value < 0) {
    throw new BusinessRuleError('invalid_cashback_config', 'Valor fixo não pode ser negativo');
  }
  if (!inRange(config.maxRedemptionPct, 0, 100)) {
    throw new BusinessRuleError(
      'invalid_cashback_config',
      'Teto de resgate deve estar entre 0 e 100',
    );
  }
  if (config.releaseDays < 0) {
    throw new BusinessRuleError(
      'invalid_cashback_config',
      'Dias de liberação não podem ser negativos',
    );
  }
  if (config.validityMonths < 0) {
    throw new BusinessRuleError('invalid_cashback_config', 'Validade não pode ser negativa');
  }
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

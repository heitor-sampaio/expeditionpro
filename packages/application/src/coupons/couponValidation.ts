import {
  compareLocalDate,
  parseLocalDate,
  type CouponMode,
  type LocalDate,
} from '@expedition/domain';
import { BusinessRuleError } from '../errors.js';

/**
 * Regras que valem igual ao criar e ao editar um cupom (§5.15). Ficam num lugar só
 * porque duas cópias de validação de dinheiro divergem — e a divergência aqui é um
 * cupom de 200% que o banco recusa depois, ou um limite zero que barra todo mundo.
 */

export interface CouponSettings {
  readonly mode: CouponMode;
  readonly value: number;
  readonly validFrom: LocalDate | null;
  readonly validUntil: LocalDate | null;
  readonly maxUses: number | null;
  readonly maxUsesPerCustomer: number | null;
  readonly itineraryId: string | null;
  readonly groupId: string | null;
}

export function assertValidCouponSettings(settings: CouponSettings): void {
  assertValue(settings.mode, settings.value);
  assertWindow(settings.validFrom, settings.validUntil);
  assertLimit(settings.maxUses);
  assertLimit(settings.maxUsesPerCustomer);

  // Saída já implica roteiro: declarar os dois cria cupom impossível quando não batem.
  if (settings.itineraryId !== null && settings.groupId !== null) {
    throw new BusinessRuleError(
      'ambiguous_scope',
      'Escolha restringir por roteiro ou por saída, não os dois',
    );
  }
}

/** Data opcional vinda da borda: string vazia e ausente são "sem data". */
export function optionalDate(value: string | null | undefined): LocalDate | null {
  const trimmed = value?.trim();
  return trimmed ? parseLocalDate(trimmed) : null;
}

function assertValue(mode: CouponMode, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BusinessRuleError('invalid_value', 'O desconto precisa ser maior que zero');
  }
  if (mode === 'percent' && value > 100) {
    throw new BusinessRuleError('invalid_value', 'O percentual não pode passar de 100');
  }
}

function assertWindow(from: LocalDate | null, until: LocalDate | null): void {
  if (from !== null && until !== null && compareLocalDate(from, until) > 0) {
    throw new BusinessRuleError('invalid_window', 'A validade termina antes de começar');
  }
}

function assertLimit(limit: number | null): void {
  if (limit === null) return;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new BusinessRuleError('invalid_limit', 'O limite de usos precisa ser maior que zero');
  }
}

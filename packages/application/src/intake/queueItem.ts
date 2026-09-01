import { maskCpf, type LocalDate, type MappedIntake } from '@expedition/domain';
import type { IntakeQueueItem } from './intakeRepository.js';

/**
 * Monta o resumo de um item da fila a partir do normalizado, com o CPF **mascarado**
 * (SEC-04). Compartilhado entre a infra e os duplos de teste para não divergir a máscara.
 */
export interface IntakeQueueCore {
  readonly id: string;
  readonly externalId: string | null;
  readonly formId: string | null;
  readonly status: string;
  readonly error: string | null;
  readonly itineraryId: string | null;
  readonly source: string;
  /** Corpo cru: o pedido do app traz a saída escolhida pelo cliente. */
  readonly payload?: unknown;
}

export function toQueueItem(
  core: IntakeQueueCore,
  normalized: MappedIntake | null,
  receivedAt: Date,
): IntakeQueueItem {
  const responsible = normalized?.responsible;
  return {
    id: core.id,
    externalId: core.externalId,
    formId: core.formId,
    status: core.status,
    responsibleName: responsible?.fullName ?? '—',
    responsibleCpf: responsible ? maskCpf(responsible.cpf) : '—',
    companionCount: normalized?.companions.length ?? 0,
    desiredDate: normalized?.desiredDate ? isoOf(normalized.desiredDate) : null,
    receivedAt: receivedAt.toISOString(),
    warnings: normalized?.warnings ?? [],
    error: core.error,
    itineraryId: core.itineraryId,
    source: core.source,
    chosenGroupId: chosenGroupOf(core.payload),
  };
}

function isoOf(date: LocalDate): string {
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return `${date.year}-${mm}-${dd}`;
}

/** A saída escolhida pelo cliente no app (payload `portal_enrollment`), quando houver. */
function chosenGroupOf(payload: unknown): string | null {
  const candidate = payload as { kind?: string; groupId?: string } | null | undefined;
  if (!candidate || candidate.kind !== 'portal_enrollment') return null;
  return candidate.groupId ?? null;
}

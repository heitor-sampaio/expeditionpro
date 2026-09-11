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

/**
 * Os envelopes que carregam uma saída **já escolhida**, e não uma a adivinhar.
 *
 * Lista explícita, e não "tem `groupId`, então serve": um payload qualquer com essa chave
 * passaria a decidir onde uma família viaja. Envelope novo entra aqui de propósito, com o
 * pensamento junto.
 */
const KINDS_COM_GRUPO = new Set(['portal_enrollment', 'site_enrollment']);

/**
 * A saída já escolhida — pelo cliente no app, ou pelo link em que ele clicou no site (IN-25).
 * Nos dois casos a fila mostra essa, e não a sugestão de "próximo grupo aberto", que existe
 * para quem chegou por um formulário que não perguntou a data.
 */
function chosenGroupOf(payload: unknown): string | null {
  const candidate = payload as { kind?: string; groupId?: string } | null | undefined;
  if (!candidate || !KINDS_COM_GRUPO.has(candidate.kind ?? '')) return null;
  return candidate.groupId ?? null;
}

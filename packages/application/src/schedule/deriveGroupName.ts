import type { LocalDate } from '@expedition/domain';

/**
 * Nome do grupo (AG-03/AG-04): o título do evento quando informado, senão derivado
 * do roteiro + data de início. Usado na criação e re-aplicado na edição, para o nome
 * automático acompanhar a mudança de data.
 */
export function deriveGroupName(
  itineraryName: string,
  startDate: LocalDate,
  title: string | null,
): string {
  const custom = title?.trim();
  if (custom) return custom;
  return `${itineraryName} · ${formatLocalDate(startDate)}`;
}

function formatLocalDate(date: LocalDate): string {
  const dd = String(date.day).padStart(2, '0');
  const mm = String(date.month).padStart(2, '0');
  return `${dd}/${mm}/${date.year}`;
}

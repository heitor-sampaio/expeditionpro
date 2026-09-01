import { compareLocalDate } from '@expedition/domain';
import type { LocalDate } from '@expedition/domain';

/**
 * A janela dos relatórios: período pela **data de início da saída**, e roteiro.
 *
 * Uma função só, compartilhada, e não uma cópia por relatório. O fechamento por saída e o
 * de gastos por categoria têm que somar **o mesmo total de gastos** no mesmo filtro — é o
 * que permite ler um ao lado do outro e confiar nos dois. Duas cópias desta regra passam
 * a divergir no primeiro ajuste de janela, e o teste de reconciliação quebraria sem que
 * ninguém soubesse por quê.
 *
 * Saída cancelada **entra**: quem filtra por período quer o que aconteceu no período, e o
 * gasto com fornecedor de uma saída cancelada saiu do caixa igual.
 */

export interface ReportWindow {
  readonly from?: LocalDate | undefined;
  readonly to?: LocalDate | undefined;
  readonly itineraryId?: string | undefined;
}

export function withinReportWindow(
  startDate: LocalDate,
  itineraryId: string,
  filter: ReportWindow,
): boolean {
  if (filter.from && compareLocalDate(startDate, filter.from) < 0) return false;
  if (filter.to && compareLocalDate(startDate, filter.to) > 0) return false;
  if (filter.itineraryId && itineraryId !== filter.itineraryId) return false;
  return true;
}

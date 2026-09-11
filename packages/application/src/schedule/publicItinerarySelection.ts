import { compareLocalDate, type LocalDate, type MonthYear } from '@expedition/domain';

/**
 * IN-25 — qual saída o link escolheu, e o que oferecer quando ele não escolheu nenhuma.
 *
 * O botão do site de apresentação carrega `?saida=jan-27`. Um anúncio, porém, continua rodando
 * depois de a saída fechar: quem clica em março num link de janeiro não pode cair num "link
 * inválido" e ir embora. Oferecer as próximas datas do mesmo roteiro é o que transforma um link
 * velho num interessado — e é a razão de esta função devolver **duas** coisas.
 *
 * Pura, no molde do `nextOpenGroup` da fila (`listAllocationQueue.ts`): quem já filtrou as
 * saídas abertas passa a lista, e aqui só se decide.
 */

export interface PublicGroup {
  readonly groupId: string;
  readonly name: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  /** PC-20: `null` = saída sem limite de vagas. */
  readonly vacancies: number | null;
}

export interface PublicSelection {
  /** A saída do mês pedido. `null` quando o mês não tem nenhuma, ou o link não trouxe mês. */
  readonly match: PublicGroup | null;
  /** As outras datas abertas, sempre em ordem — é o que se oferece quando o link não casa. */
  readonly alternatives: readonly PublicGroup[];
}

export function selectGroupForMonth(
  groups: readonly PublicGroup[],
  mes: MonthYear | null,
  hoje: LocalDate,
): PublicSelection {
  // Saída que já aconteceu não casa e não é oferecida: um link do ano passado abriria a
  // inscrição para uma viagem que já voltou.
  const futuras = groups
    .filter((grupo) => compareLocalDate(grupo.startDate, hoje) >= 0)
    .sort((a, b) => compareLocalDate(a.startDate, b.startDate));

  const match =
    mes === null
      ? null
      : (futuras.find(
          (grupo) => grupo.startDate.year === mes.year && grupo.startDate.month === mes.month,
        ) ?? null);

  return {
    match,
    // As outras continuam à mão mesmo quando o link casou: quem clicou no botão errado troca de
    // data sem ter de voltar ao site e recomeçar.
    alternatives: futuras.filter((grupo) => grupo.groupId !== match?.groupId),
  };
}

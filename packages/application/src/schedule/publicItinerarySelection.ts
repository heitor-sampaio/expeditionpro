import { compareLocalDate, type LocalDate, type MonthYear } from '@expedition/domain';

/**
 * IN-25 — qual saída o link escolheu, e o que oferecer quando ele não escolheu nenhuma.
 *
 * O botão do site de apresentação carrega `?saida=jan-27`. Um anúncio, porém, continua rodando
 * depois de a saída fechar: quem clica em março num link de janeiro não pode cair num "link
 * inválido" e ir embora. Oferecer as próximas datas do mesmo roteiro é o que transforma um link
 * velho num interessado — e é a razão de esta função devolver **duas** coisas.
 *
 * O contrário também vale: **quando o mês casou, não se oferece mais nada**. A escolha da data
 * aconteceu no site, diante do calendário; refazê-la aqui é convidar a hesitar no último passo.
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

  // Casado o mês, as outras datas somem: quem clicou no botão do site já escolheu ali,
  // olhando o calendário, e repetir a lista aqui reabre uma decisão que estava tomada. O que
  // sobra é o mesmo mês — duas saídas em novembro tornam `nov-26` ambíguo, e aí a segunda não
  // é "outra data", é a desambiguação do mês que a pessoa já escolheu.
  const oferecidas =
    match === null
      ? futuras
      : futuras.filter(
          (grupo) =>
            grupo.startDate.year === match.startDate.year &&
            grupo.startDate.month === match.startDate.month,
        );

  return {
    match,
    alternatives: oferecidas.filter((grupo) => grupo.groupId !== match?.groupId),
  };
}

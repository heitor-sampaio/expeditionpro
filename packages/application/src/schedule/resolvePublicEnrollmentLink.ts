import { parseMonthYearPtBr, type LocalDate } from '@expedition/domain';
import { selectGroupForMonth, type PublicGroup } from './publicItinerarySelection.js';
import type { ScheduleRepository } from './scheduleRepository.js';

/**
 * IN-25 — o que a página pública de inscrição precisa saber para abrir.
 *
 * O botão do site de apresentação manda `?roteiro=coxilha-rica&saida=jan-27`, e daqui sai tudo
 * o que a tela mostra: o nome do roteiro, a saída que o link escolheu e as outras datas
 * abertas. É a **única leitura do sistema que responde a um estranho**, então ela devolve só o
 * que vai na tela: nome, datas e vagas. Nada de preço, nada de quem já se inscreveu.
 *
 * **A recusa é uma só.** Tenant inexistente, roteiro inexistente e roteiro que não é de vitrine
 * devolvem o mesmo `null`. Separar os casos deixaria contar, por tentativa, quais empresas usam
 * o sistema e quais roteiros elas têm — a mesma razão pela qual os webhooks respondem 401 sem
 * distinguir slug errado de segredo errado.
 */

export interface ResolvePublicEnrollmentLinkDeps {
  readonly schedule: ScheduleRepository;
}

export interface ResolvePublicEnrollmentLinkCommand {
  readonly tenantSlug: string;
  readonly itinerarySlug: string;
  /** O mês como veio no link (`jan-27`). Ausente quando o botão não o carregou. */
  readonly saida?: string | undefined;
  readonly hoje: LocalDate;
}

export interface PublicEnrollmentLink {
  readonly itineraryId: string;
  readonly itineraryName: string;
  readonly itinerarySlug: string;
  /** A saída que o link escolheu. `null` quando o mês não tem nenhuma, ou não veio. */
  readonly match: PublicGroup | null;
  /** As outras datas abertas — é o que se oferece quando o link não casa. */
  readonly alternatives: readonly PublicGroup[];
  /**
   * O mês do link foi entendido? Separa "o link não trouxe data" de "o link trouxe uma data
   * que não consegui ler" — são frases diferentes para quem está olhando a tela.
   */
  readonly saidaReconhecida: boolean;
}

export async function resolvePublicEnrollmentLink(
  deps: ResolvePublicEnrollmentLinkDeps,
  command: ResolvePublicEnrollmentLinkCommand,
): Promise<PublicEnrollmentLink | null> {
  const roteiro = await deps.schedule.findPublicItineraryBySlug(
    command.tenantSlug,
    command.itinerarySlug,
  );
  if (roteiro === null) return null;

  const mes = command.saida === undefined ? null : parseMonthYearPtBr(command.saida);
  const { match, alternatives } = selectGroupForMonth(roteiro.groups, mes, command.hoje);

  return {
    itineraryId: roteiro.itineraryId,
    itineraryName: roteiro.itineraryName,
    itinerarySlug: roteiro.itinerarySlug,
    match,
    alternatives,
    saidaReconhecida: command.saida === undefined || mes !== null,
  };
}

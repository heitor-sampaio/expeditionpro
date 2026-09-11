import { mapCanonicalV1Payload, publicEnrollmentExternalId } from '@expedition/domain';
import { describeProcessingError } from './intakeProcessingError.js';
import { NotFoundError } from '../errors.js';
import type { IntakeRepository } from './intakeRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { SiteEnrollmentPayload } from './siteEnrollmentPayload.js';
import { SITE_ENROLLMENT_KIND, SITE_SOURCE } from './siteEnrollmentPayload.js';

/**
 * IN-25b — a inscrição que chega pela página pública.
 *
 * Ela entra na fila como qualquer outra (a decisão de 2026-08-28 vale para tudo: site ou app,
 * a equipe aprova alocando). A diferença é o ponto da fatia: **a saída já vem escolhida**,
 * porque o link disse qual era — e a equipe aloca num clique em vez de adivinhar a data.
 *
 * **Vive ao lado do `receiveIntake`, e não dentro dele.** A primeira instrução daquele é a
 * checagem da API key; criar lá um ramo cuja única função é pular a autenticação seria mexer no
 * caminho de produção testado para acomodar o caminho novo. Eles divergem em quase tudo —
 * identidade, resolução de roteiro, origem, `isTest` — e compartilham o que importa: o
 * mapeador, que é puro e é o mesmo.
 *
 * **É a primeira escrita do sistema sem segredo nenhum.** A página é pública e qualquer chave
 * embutida nela vazaria no primeiro "ver código-fonte". O que contém isso não está aqui: é a
 * fila, que não deixa nada virar cliente nem inscrição sem alguém alocar. A borda cuida do
 * resto — limite por IP, tamanho de corpo, contrato fechado.
 */

export interface ReceivePublicEnrollmentDeps {
  readonly intake: IntakeRepository;
  readonly schedule: ScheduleRepository;
  readonly clock: () => Date;
}

export interface ReceivePublicEnrollmentCommand {
  readonly tenantSlug: string;
  readonly itinerarySlug: string;
  /** A saída escolhida na página. Conferida contra o roteiro do link, nunca aceita de graça. */
  readonly groupId: string;
  /** O corpo no formato canônico — o mesmo que o perfil `canonical_v1` já sabe ler. */
  readonly body: Record<string, unknown>;
  /** Como o link veio, cru: serve para entender depois por que a pessoa chegou por aqui. */
  readonly link: { readonly roteiro: string; readonly saida?: string | undefined };
  readonly utm?: Record<string, string> | undefined;
  readonly client?: { readonly ip: string | null; readonly userAgent: string | null } | undefined;
}

export interface PublicEnrollmentReceived {
  readonly intakeId: string;
  readonly status: 'queued' | 'duplicate';
}

export async function receivePublicEnrollment(
  deps: ReceivePublicEnrollmentDeps,
  command: ReceivePublicEnrollmentCommand,
): Promise<PublicEnrollmentReceived> {
  const roteiro = await deps.schedule.findPublicItineraryBySlug(
    command.tenantSlug,
    command.itinerarySlug,
  );
  // Uma recusa só, como na leitura: tenant, roteiro e roteiro-não-público são o mesmo `404`.
  if (roteiro === null) throw new NotFoundError('roteiro');

  /*
   * **O `groupId` do navegador não vale nada até ser conferido.** Sem isto, editar a URL
   * inscreveria alguém numa saída privada, fechada, ou de outro roteiro — e o preço dessa saída
   * seria congelado na alocação como se fosse legítimo.
   */
  const saida = roteiro.groups.find((grupo) => grupo.groupId === command.groupId);
  if (saida === undefined) throw new NotFoundError('saída');

  const payload: SiteEnrollmentPayload = {
    kind: SITE_ENROLLMENT_KIND,
    // No topo, porque é daqui que a fila lê a saída escolhida.
    groupId: saida.groupId,
    link: { roteiro: command.link.roteiro, saida: command.link.saida ?? null },
    ...(command.utm === undefined ? {} : { utm: command.utm }),
    ...(command.client === undefined ? {} : { client: command.client }),
    /*
     * A chave `body` não é enfeite: o mapeador canônico já desembrulha `.body` sozinho, então o
     * envelope inteiro pode ser reprocessado mais tarde sem uma linha a mais — que é o que faz
     * o botão de reprocessar da fila funcionar para estes itens.
     */
    body: {
      ...command.body,
      // A data pretendida é a da saída resolvida, e vem do **servidor**: o que o navegador
      // mandasse seria palpite sobre uma data que o link já decidiu.
      desired_date: isoDe(saida.startDate),
    },
  };

  const externalId = publicEnrollmentExternalId(saida.groupId, cpfDoCorpo(command.body));

  const jaExiste = await deps.intake.findByExternalId(roteiro.tenantId, SITE_SOURCE, externalId);
  // Duplo clique no celular acontece — a resposta demora o tempo de uma rede móvel. A segunda
  // submissão é a mesma inscrição, e a fila não pode mostrar a família duas vezes.
  if (jaExiste !== null) return { intakeId: jaExiste.id, status: 'duplicate' };

  /*
   * O mapeador entra direto, e não pela resolução por `source`: aqui o formato é **nosso**, não
   * o de um formulário de terceiro que precisa ser descoberto. O registro de `site` em
   * `intakeProfiles` continua existindo para outra coisa — a fila relê o perfil pelo `source` da
   * linha quando alguém aperta reprocessar.
   */
  let mapped;
  try {
    mapped = mapCanonicalV1Payload(payload);
  } catch (error) {
    // IN-05: o que a pessoa digitou não se perde. Guarda como `error` — reprocessável — e
    // relança, para a tela devolver o campo culpado a quem está preenchendo.
    await deps.intake.store({
      tenantId: roteiro.tenantId,
      source: SITE_SOURCE,
      externalId,
      payload,
      normalized: null,
      formId: null,
      itineraryId: roteiro.itineraryId,
      submittedAt: deps.clock().toISOString(),
      status: 'error',
      error: describeProcessingError(error),
      isTest: false,
    });
    throw error;
  }

  const stored = await deps.intake.store({
    tenantId: roteiro.tenantId,
    source: SITE_SOURCE,
    externalId,
    payload,
    normalized: mapped,
    formId: null,
    // O roteiro vem do link, e não do mapa `form_id → roteiro`: aqui não há formulário de
    // terceiro para mapear, há um endereço que já diz de qual roteiro se trata.
    itineraryId: roteiro.itineraryId,
    submittedAt: deps.clock().toISOString(),
    status: 'needs_allocation',
    error: null,
    // `isTest` vem do prefixo da chave de API, e aqui não há chave nenhuma.
    isTest: false,
  });

  return { intakeId: stored.id, status: 'queued' };
}

/** O CPF do responsável, como veio — a validação de verdade é do mapeador. */
function cpfDoCorpo(body: Record<string, unknown>): string {
  const responsavel = body['responsible'];
  if (responsavel === null || typeof responsavel !== 'object') return '';
  const cpf = (responsavel as Record<string, unknown>)['cpf'];
  return typeof cpf === 'string' ? cpf : '';
}

function isoDe(date: { year: number; month: number; day: number }): string {
  const pad = (valor: number) => String(valor).padStart(2, '0');
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

import { listOpenGroups, resolvePublicEnrollmentLink } from '@expedition/application';
import { coreFormSchema, parseLocalDate } from '@expedition/domain';
import { z } from 'zod';
import type { OpenGroup, PublicEnrollmentLink, PublicGroup } from '@expedition/application';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * **Tudo o que responde sem autenticação nenhuma mora aqui.**
 *
 * Não é arrumação: é uma propriedade que se pode conferir. Espalhadas por `schedule.ts` e
 * companhia, as rotas públicas só se achavam comparando, uma a uma, quais handlers chamam
 * `resolveContext` — e a pergunta "o que um estranho alcança?" não tinha resposta de uma
 * olhada. Num arquivo só, tem.
 *
 * Webhooks continuam fora daqui de propósito: eles também não exigem sessão, mas são
 * autenticados por segredo e pertencem ao módulo que os recebe.
 *
 * **As três regras que valem para toda rota deste arquivo:**
 *
 * 1. **Rate limit por IP**, mais apertado que o global — não há chave para limitar por ela.
 * 2. **A recusa é uma só.** Tenant inexistente, roteiro inexistente e roteiro que não é de
 *    vitrine respondem igual. Distinguir deixaria contar, por tentativa, quais empresas usam o
 *    sistema — a mesma razão pela qual os webhooks respondem 401 sem separar slug de segredo.
 * 3. **Nada sensível no corpo.** Nome de roteiro, datas e vagas. Nunca preço de custo, nunca
 *    quem se inscreveu, nunca contagem que revele o negócio de quem quer que seja.
 */

/** Limite de leitura pública: generoso para quem navega, curto para quem varre. */
const LEITURA_PUBLICA = { max: 30, timeWindow: '1 minute' } as const;

export function registerPublicRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const tenantParam = z.object({ tenantSlug: z.string().min(1).max(60) });

  // IN-24: vitrine pública — as saídas abertas de um tenant, resolvidas pelo slug.
  typed.get(
    '/v1/public/:tenantSlug/groups',
    {
      schema: {
        params: tenantParam,
        querystring: z.object({ status: z.literal('open') }),
      },
      config: { rateLimit: LEITURA_PUBLICA },
    },
    async (request, reply) => {
      const groups = await listOpenGroups({ schedule: deps.schedule }, request.params.tenantSlug);
      return reply.send(groups.map(openGroupDto));
    },
  );

  // IN-24: os campos que o tenant espera receber, para uma integração montar o próprio
  // formulário. Estático no v1 (o núcleo), sem dado de cliente.
  typed.get(
    '/v1/public/:tenantSlug/form-schema',
    { schema: { params: tenantParam }, config: { rateLimit: LEITURA_PUBLICA } },
    async (_request, reply) => {
      return reply.send(coreFormSchema());
    },
  );

  /**
   * IN-25 — o que a página pública de inscrição precisa para abrir.
   *
   * O botão do site de apresentação leva `?roteiro=coxilha-rica&saida=jan-27`. O mês é
   * conferido aqui só quanto à **forma**; quem entende `jan-27` é o domínio, e quem decide o
   * que fazer com um mês sem saída é o caso de uso — o link velho de um anúncio que continuou
   * rodando abre a página assim mesmo, com as outras datas à vista.
   */
  typed.get(
    '/v1/public/:tenantSlug/enrollment-link',
    {
      schema: {
        params: tenantParam,
        querystring: z.object({
          roteiro: z.string().min(1).max(80),
          // Só a forma. `jan-27` vira mês no domínio; `13-27` passa aqui e o domínio recusa.
          saida: z
            .string()
            .regex(/^[a-zA-Zç]{3}-(\d{2}|\d{4})$/)
            .optional(),
        }),
      },
      config: { rateLimit: LEITURA_PUBLICA },
    },
    async (request, reply) => {
      const visao = await resolvePublicEnrollmentLink(
        { schedule: deps.schedule },
        {
          tenantSlug: request.params.tenantSlug,
          itinerarySlug: request.query.roteiro,
          saida: request.query.saida,
          hoje: hojeNaOperacao(deps),
        },
      );
      // Uma recusa só, para tenant, roteiro e roteiro-não-público.
      if (visao === null) return reply.status(404).send({ error: 'not_found' });
      return reply.send(enrollmentLinkDto(visao));
    },
  );
}

/**
 * O dia da operação, e não o do servidor: às 21h em Brasília o UTC já virou, e uma saída de
 * amanhã cedo sumiria da lista de quem está olhando hoje à noite.
 */
function hojeNaOperacao(deps: ServerDeps) {
  const agora = deps.clock?.() ?? new Date();
  return parseLocalDate(new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10));
}

function openGroupDto(group: OpenGroup) {
  return {
    groupId: group.groupId,
    name: group.name,
    itineraryName: group.itineraryName,
    startDate: isoOf(group.startDate),
    endDate: isoOf(group.endDate),
  };
}

function enrollmentLinkDto(visao: PublicEnrollmentLink) {
  return {
    itineraryName: visao.itineraryName,
    itinerarySlug: visao.itinerarySlug,
    saidaReconhecida: visao.saidaReconhecida,
    match: visao.match === null ? null : publicGroupDto(visao.match),
    alternatives: visao.alternatives.map(publicGroupDto),
  };
}

/** Sem `itineraryId`: o id interno não serve a quem está do lado de fora. */
function publicGroupDto(group: PublicGroup) {
  return {
    groupId: group.groupId,
    name: group.name,
    startDate: isoOf(group.startDate),
    endDate: isoOf(group.endDate),
    vacancies: group.vacancies,
  };
}

function isoOf(date: { year: number; month: number; day: number }): string {
  const pad = (valor: number) => String(valor).padStart(2, '0');
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

import {
  listOpenGroups,
  listPublicVehicleBrands,
  listPublicVehicleModels,
  lookupCep,
  receivePublicEnrollment,
  resolvePublicEnrollmentLink,
} from '@expedition/application';
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

  /**
   * CL-02 — o endereço de um CEP, para o autocomplete do formulário.
   *
   * **Sem `tenantSlug` no caminho, e é a única aqui.** Um CEP não é dado de tenant nenhum;
   * pedir o slug fingiria uma ligação que não existe e cobraria uma consulta a mais por letra
   * digitada. As outras duas regras do arquivo continuam valendo: limite por IP, e nada no
   * corpo além do que vai na tela.
   *
   * Existe porque a CSP do front não lista o ViaCEP em `connect-src` — a consulta feita no
   * navegador vinha sendo bloqueada em silêncio, e a tela dizia "CEP não encontrado" — e
   * porque a página de inscrição é pública: chamá-lo de lá daria a um terceiro o IP de todo
   * interessado, a mesma objeção que manteve o captcha fora do escopo (SEC-20).
   */
  typed.get(
    '/v1/public/cep/:cep',
    {
      schema: { params: z.object({ cep: z.string().min(8).max(10) }) },
      config: { rateLimit: LEITURA_PUBLICA },
    },
    async (request, reply) => {
      const endereco = await lookupCep({ ceps: deps.ceps }, { cep: request.params.cep });
      // Não encontrado é 404 e não corpo vazio: a tela distingue "não achei, preencha à mão"
      // de "achei um endereço sem rua", que é resposta legítima de cidade pequena.
      if (endereco === null) return reply.status(404).send({ error: 'not_found' });
      return reply.send(endereco);
    },
  );

  /**
   * CL-05 — o catálogo de veículos que alimenta o combobox da inscrição.
   *
   * Digitar marca e modelo à mão produz "hilux", "Hillux" e "Toyota Hilux" — três veículos
   * onde há um, e a equipe descobrindo isso no dia do comboio. O combobox é o que faz a
   * inscrição chegar com o nome que o catálogo já usa.
   *
   * Marca de carro não é segredo de negócio: o corpo é id e nome, e nada mais (regra 3).
   * Tenant inexistente devolve lista vazia, que é a recusa mais silenciosa possível — não
   * confirma nem nega que a empresa usa o sistema (regra 2).
   */
  typed.get(
    '/v1/public/:tenantSlug/vehicle-brands',
    { schema: { params: tenantParam }, config: { rateLimit: LEITURA_PUBLICA } },
    async (request, reply) => {
      const marcas = await listPublicVehicleBrands(
        { tenants: deps.tenants, vehicles: deps.vehicles },
        { tenantSlug: request.params.tenantSlug },
      );
      return reply.send(marcas);
    },
  );

  typed.get(
    '/v1/public/:tenantSlug/vehicle-brands/:brandId/models',
    {
      schema: {
        params: z.object({
          tenantSlug: z.string().min(1).max(60),
          brandId: z.string().min(1).max(60),
        }),
      },
      config: { rateLimit: LEITURA_PUBLICA },
    },
    async (request, reply) => {
      const modelos = await listPublicVehicleModels(
        { tenants: deps.tenants, vehicles: deps.vehicles },
        { tenantSlug: request.params.tenantSlug, brandId: request.params.brandId },
      );
      return reply.send(modelos);
    },
  );

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
  /**
   * IN-25b — a inscrição que vem da página pública.
   *
   * **A única escrita do sistema sem segredo nenhum.** A página é pública e qualquer chave
   * embutida nela vazaria no primeiro "ver código-fonte" — então não há chave, e as defesas são
   * outras:
   *
   * | Defesa | Contra o quê |
   * |---|---|
   * | Limite de 5/min por IP | Escrita não é leitura: 30/min numa leitura é generoso, numa escrita é convite |
   * | `bodyLimit` de 16 KB | Amplificação de armazenamento — o padrão de 1 MB, no limite de taxa, enche o banco de graça |
   * | Contrato **fechado** (`.strict()`, tudo com teto) | O webhook aceita corpo arbitrário porque o formulário é de terceiro. Aqui o formulário é nosso: não há motivo para aceitar o que não se pediu |
   * | A fila | A que de fato importa: nada vira cliente nem inscrição sem alguém alocar |
   *
   * O que **não** entra: captcha de terceiro. Seria dependência de rede no meio do caminho de
   * conversão, um terceiro vendo o IP de todo interessado, e `script-src` de outro domínio na
   * CSP que o front se dá ao trabalho de manter limpa. Entra no dia em que o abuso aparecer.
   */
  typed.post(
    '/v1/public/:tenantSlug/enrollments',
    {
      schema: {
        params: tenantParam,
        body: z
          .object({
            roteiro: z.string().min(1).max(80),
            groupId: z.string().min(1).max(64),
            /** Como o link veio, para o registro — a decisão já foi tomada pelo `groupId`. */
            saida: z
              .string()
              .regex(/^[a-zA-Zç]{3}-(\d{2}|\d{4})$/)
              .optional(),
            responsible: z
              .object({
                full_name: texto(120),
                cpf: texto(20),
                birth_date: texto(10),
                email: texto(160),
                phone: texto(24),
              })
              .strict(),
            address: z
              .object({
                street: texto(160).optional(),
                number: texto(20).optional(),
                district: texto(80).optional(),
                city: texto(80).optional(),
                state: texto(40).optional(),
                zip: texto(12).optional(),
              })
              .strict()
              .optional(),
            vehicle: z
              .object({
                brand: texto(60).optional(),
                model: texto(60).optional(),
                plate: texto(10).optional(),
              })
              .strict()
              .optional(),
            /*
             * Quinze é folga sobre a maior família que já entrou numa saída. Sem teto, um corpo
             * com dez mil acompanhantes passaria pelo `bodyLimit` e viraria dez mil validações.
             */
            companions: z
              .array(
                z.object({ full_name: texto(120), cpf: texto(20), birth_date: texto(10) }).strict(),
              )
              .max(15)
              .optional(),
            consent: z.boolean().optional(),
          })
          .strict(),
      },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      bodyLimit: 16_384,
    },
    async (request, reply) => {
      const { roteiro, groupId, saida, ...corpo } = request.body;
      const recebida = await receivePublicEnrollment(
        { intake: deps.intake, schedule: deps.schedule, clock: deps.clock ?? (() => new Date()) },
        {
          tenantSlug: request.params.tenantSlug,
          itinerarySlug: roteiro,
          groupId,
          body: corpo,
          link: { roteiro, saida },
        },
      );
      // 202 e não 201: a inscrição ainda não existe: existe um item de fila, e quem a cria é a
      // equipe ao alocar. Prometer "criada" aqui seria dizer à pessoa que ela já tem vaga.
      const codigo = recebida.status === 'duplicate' ? 200 : 202;
      return reply.status(codigo).send(recebida);
    },
  );
}

/** Texto com teto: a porta por onde entra o que um estranho digita. */
function texto(max: number) {
  return z.string().trim().min(1).max(max);
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

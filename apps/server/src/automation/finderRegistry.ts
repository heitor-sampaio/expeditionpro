import { matchesFilters, searchEntityOf } from '@expedition/domain';
import type { AutomationFinderInput, AutomationFinders, FoundItem } from '@expedition/application';
import type { RunContext } from '@expedition/domain';
import type { ServerDeps } from '../buildServer.js';

/**
 * AU-18 — o que uma automação sabe procurar, e por onde.
 *
 * O irmão do `automationActionRegistry`, e pelo mesmo motivo: este é o único lugar que conhece
 * as duas pontas — a entidade que a equipe escolheu no bloco e o repositório que a carrega. O
 * interpretador recebe o mapa pronto e não sabe o que é um cartão do funil.
 *
 * **Uma busca só, com a entidade por configuração.** Uma busca por pergunta ("conversas
 * paradas", "cartões esquecidos") seria eu decidindo as perguntas que a equipe pode fazer; aqui
 * ela escolhe a lista e monta o filtro. Entidade nova é uma entrada no catálogo do domínio e um
 * caso aqui — o resto do caminho já existe.
 *
 * Busca **lê e mais nada**. Quem muda o mundo são as ações do fluxo que ela semeia, cada uma na
 * própria execução, com o log e os tetos que toda execução tem.
 */
export function automationFinderRegistry(deps: ServerDeps): AutomationFinders {
  /**
   * A mesma leitura serve aos dois blocos: "para cada" percorre o que voltar, "buscar um" pega
   * o primeiro. Separá-las em duas implementações seria duas verdades sobre a mesma lista.
   */
  const buscar = async (input: AutomationFinderInput): Promise<readonly FoundItem[]> => {
    const entidade = searchEntityOf(input.config);
    if (entidade === null) {
      throw new Error('a busca está sem entidade escolhida');
    }

    const itens =
      entidade === 'opportunities'
        ? await cartoesDoFunil(deps, input)
        : await conversas(deps, input);

    // O filtro é do domínio, e é o **mesmo** do bloco "Se": filtrar aqui e perguntar ali
    // precisam decidir igual, senão o quadro mostra uma regra e a execução faz outra.
    // AU-19: o valor do filtro aceita variável, e ela se lê no contexto da execução — é o
    // que permite procurar "o cartão do telefone de quem acabou de escrever".
    return itens.filter((item) => matchesFilters(input.config, item.variables, input.variables));
  };

  return { for_each: buscar, find_one: buscar };
}

/** OP-01 — os cartões do funil, com etapa, origem e há quanto tempo ninguém mexe neles. */
async function cartoesDoFunil(
  deps: ServerDeps,
  { ctx, now }: AutomationFinderInput,
): Promise<FoundItem[]> {
  const [cartoes, etapas, roteiros] = await Promise.all([
    deps.opportunities.listOpportunities(ctx.tenantId),
    deps.opportunities.listStages(ctx.tenantId),
    deps.itineraries.list(ctx.tenantId),
  ]);

  return cartoes.map((cartao) => ({
    key: cartao.id,
    variables: {
      contato: { nome: cartao.contactName, telefone: cartao.phone ?? '' },
      oportunidade: {
        id: cartao.id,
        etapa: etapas.find((etapa) => etapa.id === cartao.stageId)?.name ?? '',
        origem: cartao.source,
        roteiro: roteiros.find((r) => r.id === cartao.itineraryId)?.name ?? '',
        paradaHaMin: minutosDesde(cartao.updatedAt, now),
        criadaHaMin: minutosDesde(cartao.createdAt, now),
        // OP-08: fechada quer dizer que virou inscrição e parou de andar no funil.
        fechada: cartao.bookingId !== null,
      },
    } satisfies RunContext,
  }));
}

/**
 * AT-07 — as conversas da caixa, com **quem deve resposta** já resolvido.
 *
 * Quem falou por último decide quem está devendo, e a caixa mantém os dois carimbos separados
 * justamente para essa pergunta não precisar abrir o fio de cada conversa.
 */
async function conversas(
  deps: ServerDeps,
  { ctx, now }: AutomationFinderInput,
): Promise<FoundItem[]> {
  const [fios, etapas] = await Promise.all([
    deps.conversations.listConversations(ctx.tenantId),
    deps.opportunities.listStages(ctx.tenantId),
  ]);

  const itens: FoundItem[] = [];
  for (const fio of fios) {
    const doContato = fio.lastInboundAt?.getTime() ?? 0;
    const nossa = fio.lastOutboundAt?.getTime() ?? 0;
    const ultima = Math.max(doContato, nossa);
    const cartao =
      fio.opportunityId === null
        ? null
        : await deps.opportunities.findOpportunityById(ctx.tenantId, fio.opportunityId);

    itens.push({
      key: fio.id,
      variables: {
        contato: {
          nome: fio.displayName ?? fio.phone ?? '',
          telefone: fio.phone ?? '',
          ehCliente: fio.customerId !== null,
        },
        conversa: {
          id: fio.id,
          canal: fio.channel,
          naoLidas: fio.unreadCount,
          paradaHaMin: ultima === 0 ? 0 : minutosDesde(new Date(ultima), now),
          // Nós falamos por último: quem deve é o contato. E vice-versa.
          quemDeve: nossa > doContato ? 'contato' : 'equipe',
        },
        oportunidade: {
          id: cartao?.id ?? '',
          etapa: etapas.find((etapa) => etapa.id === cartao?.stageId)?.name ?? '',
        },
      } satisfies RunContext,
    });
  }
  return itens;
}

/** Minutos inteiros desde um instante. Futuro vira zero: relógio torto não faz filtro passar. */
function minutosDesde(quando: Date, now: Date): number {
  return Math.max(Math.floor((now.getTime() - quando.getTime()) / 60_000), 0);
}

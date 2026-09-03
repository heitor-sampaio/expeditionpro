import type { AutomationFinders, FoundItem } from '@expedition/application';
import type { ServerDeps } from '../buildServer.js';

/**
 * AU-18 — o que uma automação sabe procurar, e por onde.
 *
 * O irmão do `automationActionRegistry`, e pelo mesmo motivo: este é o único lugar que conhece
 * as duas pontas — o nome do bloco que a equipe arrastou e o repositório que o cumpre. O
 * interpretador recebe o mapa pronto e não sabe o que é uma conversa.
 *
 * Busca **lê e mais nada**. Quem muda o mundo são as ações do fluxo que ela semeia, cada uma
 * na própria execução, com o log e os tetos que toda execução tem.
 */
export function automationFinderRegistry(deps: ServerDeps): AutomationFinders {
  return {
    /**
     * AT-07 · AU-18 — as conversas paradas há mais de N minutos.
     *
     * "Parada" tem dois sentidos opostos, e confundi-los manda mensagem para quem não devia:
     * `customer` é **o contato não respondeu** o que mandamos; `team` é **nós não respondemos**
     * o que ele mandou. Quem escolhe é o desenho, e a tela nomeia os dois em português.
     *
     * A conta usa os dois carimbos que a caixa já mantém separados (AT-07): sem eles, "quem
     * está esperando" precisaria abrir o fio de cada conversa.
     */
    async find_stale_conversations({ ctx, config, now }): Promise<readonly FoundItem[]> {
      const minutos = Math.max(Number(config['minutes']) || 0, 1);
      const limite = now.getTime() - minutos * 60_000;
      const esperando = config['waiting'] === 'team' ? 'team' : 'customer';

      const conversas = await deps.conversations.listConversations(ctx.tenantId);
      const paradas = conversas.filter((conversa) => {
        // Quem falou por último decide quem está devendo resposta.
        const ultimaDoContato = conversa.lastInboundAt?.getTime() ?? 0;
        const ultimaNossa = conversa.lastOutboundAt?.getTime() ?? 0;
        const quemFalou = ultimaNossa > ultimaDoContato ? 'team' : 'customer';
        const desde = Math.max(ultimaDoContato, ultimaNossa);
        if (desde === 0) return false;

        // `waiting: 'customer'` quer as que **nós** falamos por último e ninguém respondeu.
        const devendo = quemFalou === 'team' ? 'customer' : 'team';
        return devendo === esperando && desde <= limite;
      });

      const etapas = await deps.opportunities.listStages(ctx.tenantId);
      const itens: FoundItem[] = [];

      for (const conversa of paradas) {
        const oportunidade =
          conversa.opportunityId === null
            ? null
            : await deps.opportunities.findOpportunityById(ctx.tenantId, conversa.opportunityId);
        const desde = Math.max(
          conversa.lastInboundAt?.getTime() ?? 0,
          conversa.lastOutboundAt?.getTime() ?? 0,
        );
        itens.push({
          key: conversa.id,
          // AU-16: estes são exatamente os campos que `CAMPOS_DA_BUSCA` promete na tela.
          variables: {
            conversa: {
              id: conversa.id,
              paradaHaMin: Math.floor((now.getTime() - desde) / 60_000),
            },
            contato: {
              nome: conversa.displayName ?? conversa.phone ?? '',
              telefone: conversa.phone ?? '',
              ehCliente: conversa.customerId !== null,
            },
            oportunidade: {
              id: oportunidade?.id ?? '',
              etapa: etapas.find((e) => e.id === oportunidade?.stageId)?.name ?? '',
            },
          },
        });
      }

      return itens;
    },
  };
}

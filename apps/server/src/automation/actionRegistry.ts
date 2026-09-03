import {
  confirmBookingManually,
  createOpportunity,
  moveOpportunity,
  notifyTeam,
  sendChannelMessage,
  type AutomationActions,
  type RequestContext,
} from '@expedition/application';
import type { ServerDeps } from '../buildServer.js';

/**
 * AU-08 — o que uma automação sabe fazer, e por onde.
 *
 * Cada ação chama o caso de uso que **já existe**, com as guardas de audiência que já existem.
 * Automação não é caminho paralelo para o banco: se `operator` não pode confirmar inscrição,
 * uma automação ligada por um `operator` também não pode.
 *
 * Este mapa é o único lugar do sistema que conhece as duas pontas — o nome do bloco que a
 * equipe arrastou e o caso de uso que o cumpre. O interpretador recebe isto pronto e nunca
 * importa caso de uso de feature nenhum.
 *
 * **Proteção contra laço (AU-05):** os gatilhos nascem na borda HTTP; estas funções chamam o
 * caso de uso direto, sem passar por rota. Uma ação de automação, portanto, nunca dispara
 * outra automação — a classe inteira de "automação que se alimenta" não existe.
 */
export function automationActionRegistry(deps: ServerDeps): AutomationActions {
  return {
    /** AT-08 — responder na conversa que disparou o fluxo. */
    async send_message({ ctx, config, variables }) {
      const conversationId = idDaConversa(variables);
      if (conversationId === null) {
        throw new Error('esta automação não tem conversa: o gatilho dela não veio de mensagem');
      }
      const enviada = await sendChannelMessage(
        {
          conversations: deps.conversations,
          integrations: deps.channelIntegrations,
          gateway: deps.messagingGateway,
          media: deps.conversationMedia,
          clock: deps.clock ?? (() => new Date()),
        },
        ctx,
        { conversationId, body: String(config['text'] ?? '') },
      );
      return { messageId: enviada.id, conversationId };
    },

    /** OP-03 — abrir um cartão no funil com quem apareceu. */
    async create_opportunity({ ctx, config, variables }) {
      const nome = String(config['contactName'] ?? '').trim();
      if (nome === '') throw new Error('a ação de criar oportunidade está sem nome de contato');

      const criada = await createOpportunity(comFunil(deps), ctx, {
        contactName: nome,
        ...(telefoneDe(variables) === null ? {} : { phone: telefoneDe(variables)! }),
        source: 'whatsapp',
      });
      return { opportunityId: criada.id };
    },

    /** OP-05 — levar o cartão para outra coluna. A etapa vem pelo nome, que é o que a
     * equipe vê na tela; id de etapa numa automação seria impossível de ler depois. */
    async move_opportunity({ ctx, config, variables }) {
      const opportunityId = idDaOportunidade(variables);
      if (opportunityId === null) {
        throw new Error('esta automação não tem oportunidade: o gatilho dela não veio do funil');
      }
      const alvo = String(config['stageName'] ?? '')
        .trim()
        .toLowerCase();
      const etapas = await deps.opportunities.listStages(ctx.tenantId);
      const etapa = etapas.find((e) => e.name.trim().toLowerCase() === alvo);
      if (etapa === undefined)
        throw new Error(`não existe etapa chamada "${String(config['stageName'] ?? '')}"`);

      await moveOpportunity(comFunil(deps), ctx, { opportunityId, stageId: etapa.id });
      return { opportunityId, stageId: etapa.id };
    },

    /**
     * AU-13 — avisar a equipe. A lista de destinatários **nunca** vem da configuração do
     * bloco: sai de `memberships`, no tenant do contexto. Deixar a equipe digitar o endereço
     * transformaria um aviso com nome de cliente num caminho de saída para fora da empresa.
     */
    async notify_team({ ctx, config }) {
      if (deps.teamNotices === undefined) {
        throw new Error('o envio de e-mail não está configurado neste servidor');
      }
      await notifyTeam({ memberships: deps.memberships, notifications: deps.teamNotices }, ctx, {
        text: String(config['text'] ?? ''),
      });
      return { avisou: 'equipe' };
    },

    /**
     * IN-08 — confirmar sem pagamento. É ação que **toca dinheiro**: passa por
     * `confirmBookingManually`, que exige owner ou admin e motivo obrigatório — as mesmas
     * guardas de quando uma pessoa faz isso na tela (AU-08).
     *
     * O motivo registra que foi automação, e qual: sem isso, o histórico financeiro mostraria
     * uma confirmação manual que ninguém lembra de ter feito.
     */
    async confirm_booking({ ctx, config, variables }) {
      const bookingId = idDaInscricao(variables);
      if (bookingId === null) {
        throw new Error('esta automação não tem inscrição: o gatilho dela não veio de inscrição');
      }
      const motivo = String(config['note'] ?? '').trim();
      await confirmBookingManually(
        { bookings: deps.bookings, audit: deps.audit, clock: deps.clock ?? (() => new Date()) },
        ctx,
        {
          bookingId,
          note: motivo === '' ? 'Confirmada por automação.' : `Automação: ${motivo}`,
        },
      );
      return { bookingId };
    },
  };
}

function comFunil(deps: ServerDeps) {
  return { opportunities: deps.opportunities, audit: deps.audit };
}

/**
 * O gatilho põe os ids do que aconteceu dentro das variáveis. Ler daqui, e não do `triggerRef`,
 * permite que um bloco anterior tenha trocado o alvo — é o que faz "criar oportunidade e depois
 * mover" funcionar num fluxo só.
 */
function idDaConversa(variables: Record<string, unknown>): string | null {
  return textoEm(variables, 'conversa', 'id');
}

function idDaOportunidade(variables: Record<string, unknown>): string | null {
  return textoEm(variables, 'oportunidade', 'id');
}

function telefoneDe(variables: Record<string, unknown>): string | null {
  return textoEm(variables, 'contato', 'telefone');
}

function idDaInscricao(variables: Record<string, unknown>): string | null {
  return textoEm(variables, 'inscricao', 'id');
}

function textoEm(variables: Record<string, unknown>, grupo: string, campo: string): string | null {
  const bloco = variables[grupo];
  if (bloco === null || typeof bloco !== 'object') return null;
  const valor = (bloco as Record<string, unknown>)[campo];
  return typeof valor === 'string' && valor !== '' ? valor : null;
}

/** O contexto que o motor monta, exposto para a tipagem das ações não precisar adivinhar. */
export type AutomationContext = RequestContext;

import { requireTeam } from '../audience.js';
import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { ConversationRecord, ConversationRepository } from './conversationRepository.js';

export interface InboxDeps {
  readonly conversations: ConversationRepository;
  /** AT-06: para dizer **quem** é o contato quando ele já tem ficha. */
  readonly customers: CustomerRepository;
}

/**
 * AT-06 — a conversa como a caixa mostra: com o cliente por nome, quando existe.
 *
 * "Cliente cadastrado" sem dizer qual não serve para nada: quem atende precisa saber que é a
 * Ana da Coxilha Rica, não que existe alguma ficha em algum lugar.
 */
export interface ConversationView extends ConversationRecord {
  readonly customer: { readonly id: string; readonly name: string } | null;
}

/**
 * Busca os nomes **em lote**. Uma caixa com trinta conversas faria trinta consultas ao abrir
 * se cada uma buscasse a própria ficha.
 */
export async function comCliente(
  deps: { readonly customers: CustomerRepository },
  tenantId: string,
  conversas: readonly ConversationRecord[],
): Promise<ConversationView[]> {
  const ids = [...new Set(conversas.flatMap((c) => (c.customerId === null ? [] : [c.customerId])))];
  const fichas = ids.length === 0 ? [] : await deps.customers.listByIds(tenantId, ids);
  const porId = new Map(fichas.map((ficha) => [ficha.id, ficha.fullName]));

  return conversas.map((conversa) => {
    const nome = conversa.customerId === null ? undefined : porId.get(conversa.customerId);
    return {
      ...conversa,
      // Ficha apagada depois do vínculo aponta para o vazio: o contato volta a ser solto, e a
      // conversa continua legível em vez de quebrar.
      customer:
        conversa.customerId === null || nome === undefined
          ? null
          : { id: conversa.customerId, name: nome },
    };
  });
}

/**
 * AT-07 — a caixa é **compartilhada**: toda a equipe vê e responde qualquer conversa.
 *
 * Não há conversa "de alguém". Numa operação deste tamanho, conversa parada porque o dono dela
 * está na estrada é pior problema que conversa sem dono; o que a caixa compartilhada troca pela
 * atribuição é o registro de quem respondeu, que fica em cada mensagem (AT-08).
 *
 * `viewer` lê — somente leitura não é cegueira. Cliente não chega aqui: o portal não tem chat
 * (AT-11), e a RLS diz o mesmo do outro lado.
 */
export async function listConversations(
  deps: InboxDeps,
  ctx: RequestContext,
): Promise<ConversationView[]> {
  requireTeam(ctx);
  return comCliente(deps, ctx.tenantId, await deps.conversations.listConversations(ctx.tenantId));
}

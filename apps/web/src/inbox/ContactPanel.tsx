import { formatPhone } from '@expedition/domain';
import { brl } from '../ui/money.js';
import { channelLabel, contactTitle, iniciais, type Channel } from './inboxFormat.js';
import type { BoardColumn, BoardOpportunity } from '../crm/useBoard.js';
import type { ItineraryDto } from '../agenda/useItineraries.js';
import type { Conversation } from './useInbox.js';

/**
 * §5.17 — a terceira coluna: quem é o contato e em que pé está a negociação dele.
 *
 * É a coluna que dá sentido às outras duas. Ler a conversa sem saber que aquela pessoa está
 * há duas semanas em "Proposta enviada" é atender no escuro; e o cartão do funil sem a
 * conversa é digitação. As duas metades ficam visíveis ao mesmo tempo, de propósito.
 *
 * Nada aqui é editável além do vínculo com o cartão. Mudar etapa, valor e roteiro continua
 * sendo no funil — dois lugares para a mesma edição é como duas telas divergem.
 */

const ORIGENS: Record<string, string> = {
  manual: 'Cadastrada à mão',
  whatsapp: 'Veio do WhatsApp',
  instagram: 'Veio do Instagram',
  messenger: 'Veio do Messenger',
  site: 'Veio do site',
};

export function ContactPanel({
  conversation,
  columns,
  itineraries,
  totalMensagens,
  onAnexar,
  onCriar,
}: {
  conversation: Conversation;
  columns: BoardColumn[];
  itineraries: ItineraryDto[];
  totalMensagens: number;
  onAnexar: (id: string, opportunityId: string | null) => Promise<boolean>;
  onCriar: (dados: {
    conversationId: string;
    contactName: string;
    phone?: string;
    source: Channel;
  }) => Promise<boolean>;
}): React.JSX.Element {
  const titulo = contactTitle(conversation);
  const coluna = columns.find((c) =>
    c.opportunities.some((o) => o.id === conversation.opportunityId),
  );
  const cartao = coluna?.opportunities.find((o) => o.id === conversation.opportunityId) ?? null;

  return (
    <>
      <div className="inbox-side-id">
        <span className="avatar av-lg">{iniciais(titulo)}</span>
        <span className="card-title">{titulo}</span>
        <span className="member-cpf">{channelLabel(conversation.channel)}</span>
      </div>

      <dl className="inbox-facts">
        {conversation.channel === 'whatsapp' && (
          <Fato
            rotulo="Telefone"
            valor={
              conversation.phone === null ? 'Ainda não informado' : formatPhone(conversation.phone)
            }
            mono
          />
        )}
        <Fato
          rotulo="Cadastro"
          valor={conversation.customerId ? 'Cliente cadastrado' : 'Contato solto'}
        />
        <Fato rotulo="Mensagens" valor={String(totalMensagens)} mono />
        {/*
          Dois carimbos, e não um: "ele já respondeu?" e "nós já respondemos?" são perguntas
          diferentes, e quem atende faz as duas o dia inteiro.
        */}
        <Fato rotulo="Última recebida" valor={dataHora(conversation.lastInboundAt)} mono />
        <Fato rotulo="Última enviada" valor={dataHora(conversation.lastOutboundAt)} mono />
      </dl>

      <div className="inbox-side-block">
        <span className="inbox-side-title">Oportunidade</span>

        <label className="field">
          <span className="field-label">Cartão do funil</span>
          <select
            className="field-input"
            value={conversation.opportunityId ?? ''}
            onChange={(e) => void onAnexar(conversation.id, e.target.value || null)}
          >
            <option value="">Nenhuma</option>
            {columns.flatMap((c) =>
              c.opportunities.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.contactName} · {c.stage.name}
                </option>
              )),
            )}
          </select>
        </label>

        {cartao === null ? (
          <>
            <p className="field-help">
              Ligar a conversa a um cartão é o que faz o funil deixar de ser digitação.
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm inbox-new-opp"
              onClick={() =>
                void onCriar({
                  conversationId: conversation.id,
                  contactName: titulo,
                  ...(conversation.phone === null ? {} : { phone: conversation.phone }),
                  source: conversation.channel,
                })
              }
            >
              Criar oportunidade com este contato
            </button>
          </>
        ) : (
          <CartaoDoFunil
            cartao={cartao}
            etapa={coluna?.stage.name ?? '—'}
            itineraries={itineraries}
          />
        )}
      </div>
    </>
  );
}

function CartaoDoFunil({
  cartao,
  etapa,
  itineraries,
}: {
  cartao: BoardOpportunity;
  etapa: string;
  itineraries: ItineraryDto[];
}): React.JSX.Element {
  const roteiro = itineraries.find((i) => i.id === cartao.itineraryId);
  return (
    <dl className="inbox-facts">
      <Fato rotulo="Etapa" valor={etapa} />
      <Fato rotulo="Roteiro" valor={roteiro?.name ?? 'Ainda não definido'} />
      {/*
       * OP-09 — previsão, nunca caixa. A palavra "previsto" fica colada ao número em toda
       * aparição, e este valor não entra em relatório financeiro nenhum.
       */}
      <Fato
        rotulo="Valor previsto"
        valor={cartao.expectedValueCents === null ? '—' : `R$ ${brl(cartao.expectedValueCents)}`}
        mono
      />
      <Fato rotulo="Origem" valor={ORIGENS[cartao.source] ?? cartao.source} />
      <Fato rotulo="No funil desde" valor={data(cartao.createdAt)} mono />
      {cartao.lostReason && <Fato rotulo="Motivo da perda" valor={cartao.lostReason} />}
    </dl>
  );
}

function Fato({
  rotulo,
  valor,
  mono,
}: {
  rotulo: string;
  valor: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div className="inbox-fact">
      <dt className="inbox-fact-label">{rotulo}</dt>
      <dd className={`inbox-fact-value${mono ? ' is-mono' : ''}`}>{valor}</dd>
    </div>
  );
}

function data(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function dataHora(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

import { lookup } from 'node:dns/promises';
import { parseCallableUrl } from '@expedition/domain';
import { runUserCode } from './runUserCode.js';
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

    /**
     * AU-21 — chamar uma URL de fora. É "mandar webhook" quando o método é POST, e HTTP
     * genérico quando não é.
     *
     * **É a ação mais perigosa do sistema**, e por três motivos diferentes: manda dado de
     * cliente para fora, faz o servidor bater onde o desenho mandar (ver `parseCallableUrl`) e
     * pode travar o motor se o outro lado não responder. As três guardas estão aqui: endereço
     * julgado antes e depois do DNS, prazo curto, e resposta cortada — corpo de dez megabytes
     * viraria dez megabytes no `jsonb` da execução.
     */
    async http_request({ config }) {
      const metodo = String(config['method'] ?? 'POST').toUpperCase();
      const endereco = String(config['url'] ?? '').trim();
      const url = parseCallableUrl(endereco, await enderecosDe(endereco));

      const corpo = String(config['body'] ?? '');
      const temCorpo = metodo !== 'GET' && metodo !== 'HEAD' && corpo.trim() !== '';
      const controle = new AbortController();
      const prazo = setTimeout(() => {
        controle.abort();
      }, TEMPO_LIMITE_MS);

      try {
        const resposta = await fetch(url.href, {
          method: metodo,
          headers: {
            ...cabecalhos(String(config['headers'] ?? '')),
            ...(temCorpo ? { 'content-type': 'application/json' } : {}),
          },
          ...(temCorpo ? { body: corpo } : {}),
          signal: controle.signal,
          redirect: 'error',
        });

        const texto = (await resposta.text()).slice(0, RESPOSTA_MAX_CHARS);

        if (!resposta.ok) {
          throw new Error(`a chamada devolveu ${String(resposta.status)}`);
        }
        /*
         * AU-23: status, endereço e corpo — e **nunca** os cabeçalhos, que é onde mora o
         * token. Isto vai para o log e, quando o bloco pede por `saveAs`, também para o
         * contexto: é o que permite condicionar o fluxo pelo que o outro lado disse.
         */
        return {
          status: resposta.status,
          url: `${url.hostname}${url.pathname}`,
          corpo: texto,
        };
      } finally {
        clearTimeout(prazo);
      }
    },

    /**
     * AU-23 — o pedaço de JavaScript que o catálogo de blocos não cobre.
     *
     * O código roda isolado e **síncrono**: sem rede, sem espera, sem timer. Quem precisa
     * chamar alguém tem o bloco de chamar URL ao lado; misturar as duas coisas aqui daria um
     * bloco que faz tudo e que ninguém consegue auditar depois.
     *
     * O que ele devolve vira variável do fluxo pelo mesmo caminho de qualquer ação: a chave
     * `saveAs`. Sem ela, o retorno fica só no log.
     */
    run_code({ config, variables }) {
      // Síncrona por dentro: `node:vm` não espera, e é justamente isso que dá o prazo firme.
      return Promise.resolve(runUserCode(String(config['code'] ?? ''), variables));
    },
  };
}

/** Prazo curto: automação que espera meio minuto por um servidor mudo trava a fila atrás dela. */
const TEMPO_LIMITE_MS = 10_000;

/** O que cabe no contexto sem inchar o `jsonb` da execução. */
const RESPOSTA_MAX_CHARS = 2_000;

/**
 * AU-21 — os endereços para onde o host aponta **agora**.
 *
 * Um domínio público pode resolver para IP interno, e é assim que se contorna uma checagem
 * feita só sobre o nome. Falha de DNS devolve lista vazia de propósito: quem decide é
 * `parseCallableUrl`, e o `fetch` seguinte falharia de qualquer jeito.
 */
async function enderecosDe(endereco: string): Promise<string[]> {
  try {
    const { hostname } = new URL(endereco);
    const achados = await lookup(hostname.replace(/^\[|]$/g, ''), { all: true });
    return achados.map((achado) => achado.address);
  } catch {
    return [];
  }
}

/**
 * Cabeçalhos como a tela os pede: um por linha, `Nome: valor`. Linha sem dois-pontos é
 * ignorada — texto solto num campo de cabeçalho é engano, e mandar lixo para o outro lado é
 * pior que não mandar nada.
 */
function cabecalhos(texto: string): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const linha of texto.split('\n')) {
    const corte = linha.indexOf(':');
    if (corte <= 0) continue;
    const nome = linha.slice(0, corte).trim();
    const valor = linha.slice(corte + 1).trim();
    if (nome !== '' && valor !== '') saida[nome] = valor;
  }
  return saida;
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

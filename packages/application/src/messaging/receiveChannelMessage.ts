import { ipIsAllowed, mapEvolutionEvent, phoneVariants, stripMediaBytes } from '@expedition/domain';
import { UnauthorizedError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { ChannelIntegrationRepository } from './channelIntegrationRepository.js';
import type { MediaStore } from './mediaStore.js';
import type {
  Channel,
  ConversationRecord,
  ConversationRepository,
} from './conversationRepository.js';

export interface ReceiveChannelMessageDeps {
  readonly integrations: ChannelIntegrationRepository;
  readonly conversations: ConversationRepository;
  readonly customers: CustomerRepository;
  /** AT-13: onde o arquivo que veio junto é guardado. */
  readonly media: MediaStore;
}

export interface ReceiveChannelMessageCommand {
  /** Segredo apresentado, quando o provedor consegue mandar um. Vazio quando não consegue. */
  readonly token: string;
  /** AT-02: de onde a conexão veio de verdade — o último salto, nunca o que o chamador diz. */
  readonly clientIp: string;
  /** Qual canal esta rota atende. Necessário para achar a conexão quando não há segredo. */
  readonly channel: Channel;
  readonly body: unknown;
}

export interface ReceiveOutcome {
  /** `false` = evento ignorado ou mensagem repetida. Nos dois casos a resposta é 200. */
  readonly handled: boolean;
  /**
   * AU-04 — o contexto para a borda disparar a automação, presente **só** quando a mensagem
   * chegou de fora e é nova.
   *
   * Ausente na que sai: automação que reagisse à própria resposta seria laço. Ausente na
   * repetida: o eco do provedor não pode virar segunda mensagem para o cliente.
   */
  readonly trigger?: {
    readonly conversationId: string;
    readonly contactName: string;
    readonly phone: string;
    readonly text: string;
    readonly customerId: string | null;
    /**
     * AU-04 — esta mensagem abriu a conversa. É o que separa o gatilho de "conversa nova" do
     * de "mensagem recebida": quem responde ao primeiro contato de alguém precisa saber que é
     * o primeiro, e só quem procurou a conversa antes de criá-la sabe disso.
     */
    readonly conversationCreated: boolean;
  };
}

const IGNORADO: ReceiveOutcome = { handled: false };

/**
 * AT-02..AT-06 — a mensagem que chega pelo webhook da Evolution.
 *
 * Três regras herdadas do webhook de pagamento, pelas mesmas razões:
 *
 * - **O segredo autentica, não a URL.** O endereço é público por natureza: o provedor precisa
 *   alcançá-lo sem sessão. Quando o provedor não consegue apresentar segredo nenhum — nem em
 *   cabeçalho, nem em corpo, nem no caminho —, o que resta é a **origem da conexão** (AT-02).
 * - **401, nunca 403.** O endereço traz o slug do tenant, e 403 confirmaria que aquele tenant
 *   existe e tem canal conectado — enumeração de clientes da plataforma, um chute por vez.
 * - **Ignorar responde 200.** Evento desconhecido e mensagem repetida não são erro; devolver
 *   erro faria o provedor reenviar em laço para sempre.
 *
 * E uma que é daqui: **nunca cria cliente.** O §5.7.2 é explícito — auto-merge silencioso
 * corrompe a base. Casar com um cliente existente pelo telefone é seguro e reversível; criar
 * um a partir de um "oi" no WhatsApp encheria a tabela que sustenta contrato e dinheiro.
 */
export async function receiveChannelMessage(
  deps: ReceiveChannelMessageDeps,
  ctx: RequestContext,
  command: ReceiveChannelMessageCommand,
): Promise<ReceiveOutcome> {
  const integration = await autenticar(deps, ctx, command);
  if (!integration) throw new UnauthorizedError('Webhook não autenticado');

  const evento = mapEvolutionEvent(command.body);
  if (evento.kind === 'ignored') return IGNORADO;

  // AT-03: a marca é o id da mensagem no provedor. Chega antes de qualquer escrita, porque
  // o reenvio é o caso comum, não a exceção.
  const jaTemos = await deps.conversations.findMessageByExternalId(ctx.tenantId, evento.externalId);
  if (jaTemos) return IGNORADO;

  const identidade = { channelUserId: evento.channelUserId, phone: evento.phone };
  /*
   * Todas as maneiras de escrever este contato: o LID, o telefone e — no Brasil — o telefone
   * na outra grafia do nono dígito (AT-06). A instância manda `55 48 8888-8888` onde a ficha
   * tem `55 48 98888-8888`, e comparando texto nada casa.
   */
  const formas = [
    identidade.channelUserId,
    ...(identidade.phone === null ? [] : phoneVariants(identidade.phone)),
  ];
  const existente = await deps.conversations.findByChannelUser(
    ctx.tenantId,
    integration.channel,
    formas,
  );

  const conversa =
    existente === null
      ? await deps.conversations.createConversation({
          tenantId: ctx.tenantId,
          channel: integration.channel,
          ...identidade,
          displayName: evento.displayName,
          customerId: await clientePeloTelefone(deps, ctx, integration.channel, evento.phone),
        })
      : // AT-05: o mesmo contato chegou pela outra forma de endereçamento. A conversa é a
        // mesma, e passa a ser identificada pelo LID assim que ele aparece.
        await converger(deps, ctx, existente, identidade);

  /*
   * AT-06 — tenta o vínculo com a ficha **a cada mensagem**, não só ao abrir a conversa.
   *
   * O caso real: alguém chama antes de existir cadastro e vira inscrição dias depois. Sem
   * tentar de novo, a conversa fica para sempre como contato solto, e quem atende continua
   * sem saber que ali tem ficha e histórico.
   *
   * Vínculo que já existe não é mexido: pode ter sido a equipe que o fez à mão, e a regra
   * automática não tem por que discordar de uma pessoa que olhou.
   */
  let customerId = conversa.customerId;
  if (customerId === null) {
    const ficha = await clientePeloTelefone(deps, ctx, integration.channel, evento.phone);
    if (ficha !== null) {
      await deps.conversations.linkCustomer(ctx.tenantId, conversa.id, ficha);
      customerId = ficha;
    }
  }

  /*
   * AT-13 — o arquivo vai para o bucket antes de a mensagem ser gravada, para a linha já
   * nascer apontando para ele. Se guardar falhar, `guardada` é `null` e a mensagem entra
   * assim mesmo, com o marcador: um anexo perdido é um problema; a mensagem sumindo do fio,
   * outro bem maior.
   */
  const guardada =
    evento.media === null
      ? null
      : await deps.media.save({
          tenantId: ctx.tenantId,
          conversationId: conversa.id,
          externalId: evento.externalId,
          mimeType: evento.media.mimeType,
          fileName: evento.media.fileName,
          base64: evento.media.base64,
        });

  await deps.conversations.addMessage({
    tenantId: ctx.tenantId,
    conversationId: conversa.id,
    externalId: evento.externalId,
    direction: evento.direction,
    body: evento.body,
    // Mensagem que chega não tem autor da equipe; a que sai pelo celular pareado também não
    // — quem respondeu foi alguém no aparelho, e o provedor não diz quem (AT-08).
    sentByUserId: null,
    media:
      evento.media === null || guardada === null
        ? null
        : {
            kind: evento.media.kind,
            mimeType: evento.media.mimeType,
            fileName: evento.media.fileName,
            path: guardada.path,
            sizeBytes: guardada.sizeBytes,
          },
    // AT-04 · AT-13: o registro do que chegou, **sem** os bytes do arquivo — eles já estão
    // no bucket, e guardá-los aqui de novo dobraria o maior objeto do banco.
    payload: stripMediaBytes(command.body),
    sentAt: evento.sentAt,
  });

  await deps.conversations.touchConversation(ctx.tenantId, conversa.id, {
    at: evento.sentAt,
    // A direção decide qual carimbo anda e se o não lido sobe: o que sai já foi visto por
    // quem escreveu, inclusive quando foi digitado no celular pareado.
    direction: evento.direction,
    // O nome do WhatsApp muda quando a pessoa troca o perfil; vale sempre o mais recente.
    ...(evento.displayName === null ? {} : { displayName: evento.displayName }),
  });

  // AU-04: só o que chega de fora acorda automação. A que sai já é resposta.
  if (evento.direction !== 'in') return { handled: true };

  return {
    handled: true,
    trigger: {
      conversationId: conversa.id,
      // Identidade por LID pode não trazer telefone: o vazio é honesto, e a condição da
      // automação sabe lidar com campo vazio.
      contactName: evento.displayName ?? conversa.displayName ?? evento.phone ?? '',
      phone: evento.phone ?? '',
      text: evento.body,
      customerId,
      conversationCreated: existente === null,
    },
  };
}

/**
 * AT-02 — quem pode escrever nesta caixa.
 *
 * Duas provas, e **uma basta**:
 *
 * - **o segredo**, quando o provedor consegue apresentá-lo. É a prova melhor: vale de qualquer
 *   lugar e não depende de onde o servidor do provedor está hospedado;
 * - **a origem da conexão**, quando ele não consegue. A equipe declara o endereço do servidor
 *   da instância, e só ele entra.
 *
 * Cerca vazia não libera ninguém: quem conectou o canal e não preencheu o campo continua
 * dependendo do segredo. O padrão de quem esquece de configurar é o fechado.
 */
async function autenticar(
  deps: ReceiveChannelMessageDeps,
  ctx: RequestContext,
  command: ReceiveChannelMessageCommand,
) {
  if (command.token !== '') {
    const porSegredo = await deps.integrations.findByWebhookToken(ctx.tenantId, command.token);
    if (porSegredo) return porSegredo;
  }

  const doCanal = await deps.integrations.findByChannel(ctx.tenantId, command.channel);
  if (doCanal?.active && ipIsAllowed(command.clientIp, doCanal.allowedIps)) return doCanal;
  return null;
}

/**
 * AT-05 — mantém a conversa com a identidade mais recente, sem abrir outra.
 *
 * Só escreve quando algo mudou: a maioria esmagadora das mensagens chega com a mesma
 * identidade que já está lá, e uma escrita por mensagem recebida seria desperdício puro.
 */
async function converger(
  deps: ReceiveChannelMessageDeps,
  ctx: RequestContext,
  conversa: ConversationRecord,
  identidade: { channelUserId: string; phone: string | null },
): Promise<ConversationRecord> {
  const mudou =
    conversa.channelUserId !== identidade.channelUserId ||
    (identidade.phone !== null && conversa.phone !== identidade.phone);
  if (!mudou) return conversa;

  return deps.conversations.updateIdentity(ctx.tenantId, conversa.id, {
    channelUserId: identidade.channelUserId,
    // Telefone conhecido não é apagado por um evento que só trouxe LID.
    phone: identidade.phone ?? conversa.phone,
  });
}

/**
 * AT-06 — casa com um cliente existente, e **só quando não há dúvida**.
 *
 * Telefone repetido em duas fichas é comum aqui: o número do responsável costuma estar em
 * mais de uma pessoa da família. Escolher uma seria adivinhar, e adivinhar joga a conversa na
 * pessoa errada — a equipe vincula à mão, que é reversível. Fora do WhatsApp nem se tenta: o
 * id do Instagram e do Messenger é opaco e não é telefone.
 */
async function clientePeloTelefone(
  deps: ReceiveChannelMessageDeps,
  ctx: RequestContext,
  channel: string,
  phone: string | null,
): Promise<string | null> {
  // Pelo telefone, nunca pelo LID: o LID não é número e não existe em cadastro nenhum, então
  // procurar cliente por ele não acharia nunca — e o silêncio pareceria "não é cliente".
  if (channel !== 'whatsapp' || phone === null) return null;

  // As duas grafias, e a dúvida continua sendo dúvida: se cada uma achar uma ficha diferente,
  // são dois candidatos e nenhum é escolhido.
  const listas = await Promise.all(
    phoneVariants(phone).map((forma) => deps.customers.listByPhone(ctx.tenantId, forma)),
  );
  const candidatos = [...new Map(listas.flat().map((ficha) => [ficha.id, ficha])).values()];
  return candidatos.length === 1 ? (candidatos[0]?.id ?? null) : null;
}

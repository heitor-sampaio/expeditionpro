/**
 * AU-16 — o contrato do contexto: o que cada gatilho põe à disposição de quem desenha.
 *
 * Sem isto, escrever uma automação é adivinhar nome de campo. A pessoa digita `contato.fone`,
 * a variável ausente vira vazio em silêncio (AU-09, e é a regra certa), a mensagem sai sem o
 * nome do cliente e ninguém descobre — porque não há erro nenhum para descobrir.
 *
 * Fica no domínio, e não na tela, porque as duas pontas dependem dele: a tela oferece a lista,
 * e o teste da borda cobra que o contexto realmente disparado tenha o que aqui está prometido.
 * Promessa que só a tela conhece é promessa que a borda quebra na primeira mudança.
 */

export type TriggerType =
  | 'message_received'
  /** AU-17: o que a equipe manda pela caixa. O eco do provedor **não** conta (AU-05). */
  | 'message_sent'
  | 'conversation_created'
  | 'opportunity_created'
  | 'opportunity_moved'
  | 'booking_created'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'payment_registered'
  /** AU-12: em relação à data de início de uma saída. É varrido, não agendado. */
  | 'scheduled'
  /** AU-17: de tempos em tempos, sem entidade por trás. Varrido por fatia de tempo. */
  | 'recurring'
  /** AU-21: alguém de fora bate numa URL desta automação, com a API key do tenant. */
  | 'webhook_received';

export const TRIGGER_TYPES = [
  'message_received',
  'message_sent',
  'conversation_created',
  'opportunity_created',
  'opportunity_moved',
  'booking_created',
  'booking_confirmed',
  'booking_cancelled',
  'payment_registered',
  'scheduled',
  'recurring',
  'webhook_received',
] as const satisfies readonly TriggerType[];

/** Um campo do contexto, como o seletor o mostra: o caminho que vale, e o nome que se lê. */
export interface ContextField {
  readonly path: string;
  readonly label: string;
}

const CONTATO: readonly ContextField[] = [
  { path: 'contato.nome', label: 'Nome do contato' },
  { path: 'contato.telefone', label: 'Telefone do contato' },
];

const CONVERSA: readonly ContextField[] = [
  ...CONTATO,
  { path: 'contato.ehCliente', label: 'Já é cliente (true ou false)' },
  { path: 'conversa.id', label: 'Id da conversa' },
  { path: 'mensagem.texto', label: 'Texto da mensagem' },
];

const OPORTUNIDADE: readonly ContextField[] = [
  ...CONTATO,
  { path: 'oportunidade.id', label: 'Id da oportunidade' },
  { path: 'oportunidade.etapa', label: 'Etapa do funil' },
];

/** O que a borda de inscrição manda hoje. Um id só — e o seletor não finge que há mais. */
const INSCRICAO: readonly ContextField[] = [{ path: 'inscricao.id', label: 'Id da inscrição' }];

export const CAMPOS_DO_GATILHO: Record<TriggerType, readonly ContextField[]> = {
  message_received: CONVERSA,
  message_sent: CONVERSA,
  conversation_created: CONVERSA,
  opportunity_created: OPORTUNIDADE,
  opportunity_moved: OPORTUNIDADE,
  booking_created: INSCRICAO,
  booking_confirmed: INSCRICAO,
  booking_cancelled: [...INSCRICAO, { path: 'inscricao.motivo', label: 'Motivo do cancelamento' }],
  payment_registered: INSCRICAO,
  scheduled: [
    { path: 'saida.nome', label: 'Nome do grupo' },
    { path: 'saida.inicio', label: 'Data de início (aaaa-mm-dd)' },
  ],
  // AU-17: o gatilho de tempo não pende de entidade nenhuma, então não promete contato nem
  // inscrição. Prometer o que não vem seria pior que não prometer nada.
  recurring: [
    { path: 'agora.data', label: 'Data de hoje (aaaa-mm-dd)' },
    { path: 'agora.hora', label: 'Hora agora (hh:mm)' },
  ],
  /*
   * AU-21: o corpo do webhook é de quem chama, e por isso o catálogo promete só o que é sempre
   * verdade. Os campos de dentro do corpo se escrevem à mão — `webhook.corpo.email` —, que é
   * o que a opção "outro campo" existe para atender.
   */
  webhook_received: [
    { path: 'webhook.nome', label: 'Nome do gancho chamado' },
    { path: 'webhook.recebidoEm', label: 'Quando chegou (ISO)' },
    { path: 'webhook.corpo', label: 'O corpo inteiro (use webhook.corpo.campo)' },
  ],
};

/** Os campos do gatilho escolhido. Rascunho ainda sem gatilho não promete nada. */
export function contextFieldsFor(trigger: TriggerType | null): readonly ContextField[] {
  return trigger === null ? [] : CAMPOS_DO_GATILHO[trigger];
}

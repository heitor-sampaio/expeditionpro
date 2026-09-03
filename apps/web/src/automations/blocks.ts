import type { NodeKind } from '@expedition/domain';

/**
 * §5.18 — o catálogo de blocos: o que a equipe pode arrastar para o quadro.
 *
 * É dado, e fica separado da tela de propósito: quando a fatia do motor acrescentar uma ação,
 * ela entra aqui e aparece na biblioteca sem ninguém mexer no editor.
 *
 * Os rótulos são em sentence case e com verbo primeiro, como manda o design system.
 */

export interface BlockType {
  /** O `type` que vai para o grafo. A espécie (`kind`) decide as saídas e o desenho. */
  readonly type: string;
  readonly kind: NodeKind;
  readonly label: string;
  readonly hint: string;
  readonly config: Record<string, unknown>;
}

export const GATILHOS: readonly BlockType[] = [
  {
    type: 'message_received',
    kind: 'trigger',
    label: 'Mensagem recebida',
    hint: 'Alguém escreveu na caixa',
    config: {},
  },
  {
    type: 'conversation_created',
    kind: 'trigger',
    label: 'Conversa nova',
    hint: 'Primeiro contato de alguém',
    config: {},
  },
  {
    type: 'opportunity_created',
    kind: 'trigger',
    label: 'Oportunidade criada',
    hint: 'Cartão novo no funil',
    config: {},
  },
  {
    type: 'opportunity_moved',
    kind: 'trigger',
    label: 'Oportunidade movida',
    hint: 'Cartão mudou de etapa',
    config: {},
  },
  {
    type: 'booking_created',
    kind: 'trigger',
    label: 'Inscrição criada',
    hint: 'Uma família entrou num grupo',
    config: {},
  },
  {
    type: 'booking_confirmed',
    kind: 'trigger',
    label: 'Inscrição confirmada',
    hint: 'O primeiro pagamento entrou',
    config: {},
  },
  {
    type: 'payment_registered',
    kind: 'trigger',
    label: 'Pagamento registrado',
    hint: 'Entrou dinheiro numa inscrição',
    config: {},
  },
  {
    type: 'scheduled',
    kind: 'trigger',
    label: 'Perto de uma saída',
    hint: 'Tantos dias antes ou depois da data de início',
    config: { offsetDays: -3 },
  },
];

export const BLOCOS: readonly BlockType[] = [
  {
    type: 'field',
    kind: 'condition',
    label: 'Se',
    hint: 'Compara um campo e separa o caminho em sim e não',
    config: { field: '', operator: 'contains', value: '' },
  },
  {
    type: 'set',
    kind: 'setVariable',
    label: 'Definir variável',
    hint: 'Guarda um valor para usar mais adiante',
    config: { name: '', value: '' },
  },
  {
    type: 'wait',
    kind: 'delay',
    label: 'Esperar',
    hint: 'Segura o fluxo e continua depois',
    config: { amount: 1, unit: 'days' },
  },
  {
    type: 'send_message',
    kind: 'action',
    label: 'Responder na conversa',
    hint: 'Manda uma mensagem pelo canal do contato',
    config: { text: '' },
  },
  {
    type: 'create_opportunity',
    kind: 'action',
    label: 'Criar oportunidade',
    hint: 'Abre um cartão no funil com o contato',
    config: { contactName: '{{contato.nome}}' },
  },
  {
    type: 'move_opportunity',
    kind: 'action',
    label: 'Mover de etapa',
    hint: 'Leva o cartão para outra coluna do funil',
    config: { stageName: '' },
  },
  {
    type: 'notify_team',
    kind: 'action',
    label: 'Avisar a equipe',
    hint: 'Manda um e-mail para quem trabalha aqui',
    config: { text: '' },
  },
  {
    type: 'confirm_booking',
    kind: 'action',
    label: 'Confirmar inscrição',
    hint: 'Sem pagamento, com motivo registrado. Mexe no financeiro',
    config: { note: '' },
  },
  {
    type: 'end',
    kind: 'end',
    label: 'Fim',
    hint: 'Encerra este caminho',
    config: {},
  },
];

/**
 * AU-13 — as ações que mexem no financeiro.
 *
 * A tela avisa em texto o que a automação vai fazer sozinha antes de ligar, e o servidor
 * recusa sem a confirmação. As duas pontas, porque só a tela seria contornável por quem
 * chamasse a rota direto.
 */
export const ACOES_DE_DINHEIRO = new Set(['confirm_booking']);

const POR_TIPO = new Map([...GATILHOS, ...BLOCOS].map((bloco) => [bloco.type, bloco]));

/** O rótulo de um bloco já posto no quadro. Tipo desconhecido mostra o próprio nome. */
export function blockLabel(type: string): string {
  return POR_TIPO.get(type)?.label ?? type;
}

/** As saídas de cada espécie, para o desenho do bloco saber quantas alças mostrar. */
export const SAIDAS: Record<NodeKind, readonly { port: string; label: string }[]> = {
  trigger: [{ port: 'next', label: '' }],
  condition: [
    { port: 'true', label: 'sim' },
    { port: 'false', label: 'não' },
  ],
  setVariable: [{ port: 'next', label: '' }],
  delay: [{ port: 'next', label: '' }],
  action: [{ port: 'next', label: '' }],
  end: [],
};

/** Um campo de configuração do bloco, como o inspetor deve desenhá-lo. */
export interface BlockField {
  readonly key: string;
  readonly label: string;
  readonly kind: 'text' | 'number' | 'textarea' | 'select';
  readonly help?: string;
  readonly placeholder?: string;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}

/**
 * O que cada bloco pergunta. Fica em dado, e não em `switch` dentro do inspetor: bloco novo
 * só acrescenta uma linha aqui, e o inspetor continua o mesmo.
 */
export const CAMPOS: Record<string, readonly BlockField[]> = {
  field: [
    {
      key: 'field',
      label: 'Campo',
      kind: 'text',
      placeholder: 'mensagem.texto',
      help: 'Disponíveis: contato.nome, contato.telefone, mensagem.texto, oportunidade.etapa.',
    },
    {
      key: 'operator',
      label: 'Comparação',
      kind: 'select',
      options: [
        { value: 'contains', label: 'contém' },
        { value: 'equals', label: 'é igual a' },
        { value: 'not_equals', label: 'é diferente de' },
        { value: 'empty', label: 'está vazio' },
        { value: 'not_empty', label: 'não está vazio' },
      ],
    },
    { key: 'value', label: 'Valor', kind: 'text', placeholder: 'preço' },
  ],
  set: [
    { key: 'name', label: 'Nome da variável', kind: 'text', placeholder: 'saudacao' },
    {
      key: 'value',
      label: 'Valor',
      kind: 'text',
      placeholder: 'Bom dia, {{contato.nome}}',
      help: 'Aceita variáveis entre chaves duplas.',
    },
  ],
  wait: [
    { key: 'amount', label: 'Quanto', kind: 'number', placeholder: '1' },
    {
      key: 'unit',
      label: 'Unidade',
      kind: 'select',
      options: [
        { value: 'minutes', label: 'minutos' },
        { value: 'hours', label: 'horas' },
        { value: 'days', label: 'dias' },
      ],
    },
  ],
  send_message: [
    {
      key: 'text',
      label: 'Mensagem',
      kind: 'textarea',
      placeholder: 'Oi {{contato.nome}}! O valor sai por…',
      help: 'Aceita variáveis entre chaves duplas.',
    },
  ],
  create_opportunity: [
    { key: 'contactName', label: 'Nome do contato', kind: 'text', placeholder: '{{contato.nome}}' },
  ],
  move_opportunity: [
    { key: 'stageName', label: 'Etapa', kind: 'text', placeholder: 'Em conversa' },
  ],
  scheduled: [
    {
      key: 'offsetDays',
      label: 'Dias em relação à saída',
      kind: 'number',
      placeholder: '-3',
      help: 'Negativo é antes da saída; positivo, depois. Zero é o dia dela.',
    },
  ],
  confirm_booking: [
    {
      key: 'note',
      label: 'Motivo',
      kind: 'text',
      placeholder: 'pagou por fora, cortesia…',
      help: 'Fica no histórico financeiro da inscrição, junto da marca de que foi automação.',
    },
  ],
  notify_team: [
    {
      key: 'text',
      label: 'Aviso',
      kind: 'textarea',
      placeholder: '{{contato.nome}} perguntou preço fora do horário.',
    },
  ],
};

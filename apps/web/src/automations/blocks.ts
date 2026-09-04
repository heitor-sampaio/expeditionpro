import { CATALOGO_DE_BUSCA, SEARCH_ENTITIES, switchCases } from '@expedition/domain';
import type { NodeKind } from '@expedition/domain';

/** As listas que o bloco "Para cada" percorre, na ordem em que a tela as oferece. */
const ENTIDADES = SEARCH_ENTITIES.map((entidade) => CATALOGO_DE_BUSCA[entidade]);

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
    type: 'message_sent',
    kind: 'trigger',
    label: 'Mensagem enviada',
    hint: 'A equipe respondeu pela caixa',
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
    type: 'booking_cancelled',
    kind: 'trigger',
    label: 'Inscrição cancelada',
    hint: 'Alguém saiu da saída, com motivo',
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
    label: 'Tempo: antes ou depois de uma saída',
    hint: 'Tantos dias antes ou depois da data de início',
    config: { offsetDays: -3 },
  },
  {
    type: 'recurring',
    kind: 'trigger',
    label: 'Tempo: de tempos em tempos',
    hint: 'A cada tantos minutos, horas ou dias',
    config: { amount: 1, unit: 'days' },
  },
  {
    type: 'webhook_received',
    kind: 'trigger',
    label: 'Webhook recebido',
    hint: 'Alguém de fora chamou a URL deste gancho',
    config: { name: '' },
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
    type: 'match',
    kind: 'switch',
    label: 'Escolha múltipla',
    hint: 'Um caminho por valor do campo, mais o padrão',
    config: { field: '', cases: [] },
  },
  {
    type: 'find_one',
    kind: 'lookup',
    label: 'Buscar',
    hint: 'Procura o primeiro, ou todos, e separa em achou e não achou',
    config: { entity: 'opportunities', filters: [], mode: 'first', as: 'resultado' },
  },
  {
    type: 'for_each',
    kind: 'forEach',
    label: 'Para cada',
    hint: 'Percorre a lista que uma busca guardou e segue o fluxo item a item',
    config: { list: 'resultado', limit: 0 },
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
    type: 'http_request',
    kind: 'action',
    label: 'Chamar URL',
    hint: 'Manda um webhook, ou qualquer chamada HTTP, e lê a resposta',
    config: { method: 'POST', url: '', headers: '', body: '' },
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

const SAIDAS_FIXAS: Record<Exclude<NodeKind, 'switch'>, readonly Saida[]> = {
  trigger: [{ port: 'next', label: '' }],
  // AU-18: a busca tem uma saída só, e ela quer dizer "para cada achado, siga daqui".
  forEach: [{ port: 'next', label: 'cada um' }],
  // AU-19: "não achou" é um destino tão legítimo quanto "achou" — e é onde mora o "então crie".
  lookup: [
    { port: 'true', label: 'achou' },
    { port: 'false', label: 'não achou' },
  ],
  condition: [
    { port: 'true', label: 'sim' },
    { port: 'false', label: 'não' },
  ],
  setVariable: [{ port: 'next', label: '' }],
  delay: [{ port: 'next', label: '' }],
  action: [{ port: 'next', label: '' }],
  end: [],
};

export interface Saida {
  readonly port: string;
  readonly label: string;
}

/**
 * As saídas de um bloco, para o quadro saber quantas alças mostrar e com que rótulo.
 *
 * A escolha múltipla depende da configuração, e por isso a pergunta é feita ao bloco e não à
 * espécie. O rótulo é o **valor** que a equipe escreveu: alça sem rótulo num bloco de cinco
 * saídas é onde se liga o caminho errado.
 */
export function saidasDe(kind: NodeKind, config: Record<string, unknown>): readonly Saida[] {
  if (kind !== 'switch') return SAIDAS_FIXAS[kind];
  return [
    ...switchCases(config).map((caso) => ({
      port: `case_${caso.id}`,
      label: caso.value.trim() === '' ? 'sem valor' : caso.value,
    })),
    { port: 'default', label: 'padrão' },
  ];
}

/** Um campo de configuração do bloco, como o inspetor deve desenhá-lo. */
export interface BlockField {
  readonly key: string;
  readonly label: string;
  /**
   * `path` é o seletor de campo do contexto (AU-16); `cases`, a lista de valores da escolha
   * múltipla. Os dois existem porque digitar de cabeça é onde o erro não dá erro.
   */
  readonly kind: 'text' | 'number' | 'textarea' | 'select' | 'path' | 'cases' | 'filters';
  readonly help?: string;
  readonly placeholder?: string;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  /** AU-09: aceita `{{variável}}`, e por isso o inspetor oferece o inseridor de campo. */
  readonly template?: boolean;
}

/**
 * O que cada bloco pergunta. Fica em dado, e não em `switch` dentro do inspetor: bloco novo
 * só acrescenta uma linha aqui, e o inspetor continua o mesmo.
 */
export const CAMPOS: Record<string, readonly BlockField[]> = {
  field: [
    { key: 'field', label: 'Campo', kind: 'path' },
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
  match: [
    { key: 'field', label: 'Campo', kind: 'path' },
    {
      key: 'cases',
      label: 'Valores',
      kind: 'cases',
      help: 'Um caminho por valor, na ordem. O que não casar com nenhum sai pelo padrão.',
    },
  ],
  /*
   * AU-18: a busca é um mecanismo, não uma pergunta pronta. A equipe escolhe a lista, monta o
   * filtro com os campos dela, e o fluxo adiante roda uma vez por item.
   */
  /**
   * AU-19: buscar um item, e o que ele achar entra no contexto — inclusive para o bloco "Se"
   * adiante. Mesmos campos do "para cada", porque é a mesma pergunta feita à mesma lista.
   */
  /**
   * AU-19 · AU-20: buscar em qualquer lista do sistema — o primeiro que casar, ou todos. O
   * primeiro entra direto no contexto; todos ficam numa lista com nome, que o    * percorre depois.
   */
  find_one: [
    {
      key: 'entity',
      label: 'Procurar em',
      kind: 'select',
      options: ENTIDADES.map((entidade) => ({ value: entidade.entity, label: entidade.label })),
    },
    {
      key: 'mode',
      label: 'Trazer',
      kind: 'select',
      options: [
        { value: 'first', label: 'o primeiro que casar' },
        { value: 'all', label: 'todos os que casarem' },
      ],
    },
    {
      key: 'filters',
      label: 'Que',
      kind: 'filters',
      help: 'O valor aceita variável: para achar o de quem escreveu, compare com {{contato.telefone}}.',
    },
    {
      key: 'as',
      label: 'Guardar a lista como',
      kind: 'text',
      placeholder: 'resultado',
      help: 'Só vale ao trazer todos. É este nome que o bloco "para cada" percorre.',
    },
  ],
  /**
   * AU-20: percorrer é outro bloco, e não um modo da busca. Separá-los é o que permite olhar o
   * resultado antes de agir — contar, condicionar, avisar a equipe se veio vazio.
   */
  for_each: [
    {
      key: 'list',
      label: 'Percorrer a lista',
      kind: 'text',
      placeholder: 'resultado',
      help: 'O nome que a busca usou em "guardar a lista como".',
    },
    {
      key: 'limit',
      label: 'No máximo, por passada',
      kind: 'number',
      placeholder: 'tudo',
      help: 'Deixe vazio para percorrer tudo. O que não couber numa passada fica na fila para a seguinte.',
    },
  ],
  set: [
    { key: 'name', label: 'Nome da variável', kind: 'text', placeholder: 'saudacao' },
    {
      key: 'value',
      label: 'Valor',
      kind: 'text',
      placeholder: 'Bom dia, {{contato.nome}}',
      template: true,
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
      template: true,
    },
  ],
  create_opportunity: [
    {
      key: 'contactName',
      label: 'Nome do contato',
      kind: 'text',
      placeholder: '{{contato.nome}}',
      template: true,
    },
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
  // AU-17: as mesmas chaves do bloco de espera, de propósito — é a mesma pergunta ("quanto
  // tempo?"), e uma conversão só é uma coisa a menos para discordar de si mesma.
  recurring: [
    { key: 'amount', label: 'A cada', kind: 'number', placeholder: '1' },
    {
      key: 'unit',
      label: 'Unidade',
      kind: 'select',
      options: [
        { value: 'minutes', label: 'minutos' },
        { value: 'hours', label: 'horas' },
        { value: 'days', label: 'dias' },
      ],
      help: 'Mínimo de um minuto, e abaixo de três o teto de 20 execuções por hora barra o resto.',
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
  // AU-21: o gancho é identificado pelo nome, que também vai na URL.
  webhook_received: [
    {
      key: 'name',
      label: 'Nome do gancho',
      kind: 'text',
      placeholder: 'site-contato',
      help: 'Entra na URL: /v1/automations/hooks/<seu-tenant>/<nome>. Sem espaço nem acento.',
    },
  ],
  /*
   * AU-21: chamar para fora. É a ação mais perigosa do sistema — manda dado de cliente embora e
   * faz o servidor bater onde o desenho mandar —, e por isso só https, sem endereço de rede
   * interna, com prazo de dez segundos.
   */
  http_request: [
    {
      key: 'method',
      label: 'Método',
      kind: 'select',
      options: [
        { value: 'POST', label: 'POST' },
        { value: 'GET', label: 'GET' },
        { value: 'PUT', label: 'PUT' },
        { value: 'PATCH', label: 'PATCH' },
        { value: 'DELETE', label: 'DELETE' },
      ],
    },
    {
      key: 'url',
      label: 'Endereço',
      kind: 'text',
      placeholder: 'https://api.parceiro.com/hooks/lead',
      template: true,
      help: 'Só https, e nunca endereço de rede interna.',
    },
    {
      key: 'headers',
      label: 'Cabeçalhos',
      kind: 'textarea',
      placeholder: 'Authorization: Bearer abc123',
      help: 'Um por linha, Nome: valor. Fica salvo no desenho — quem edita a automação vê.',
    },
    {
      key: 'body',
      label: 'Corpo (JSON)',
      kind: 'textarea',
      placeholder: '{"nome": "{{contato.nome}}", "telefone": "{{contato.telefone}}"}',
      template: true,
      help: 'A resposta fica em resposta.status e resposta.corpo, para o fluxo adiante usar.',
    },
  ],
  notify_team: [
    {
      key: 'text',
      label: 'Aviso',
      kind: 'textarea',
      placeholder: '{{contato.nome}} perguntou preço fora do horário.',
      template: true,
    },
  ],
};

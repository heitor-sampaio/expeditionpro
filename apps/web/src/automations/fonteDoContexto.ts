import type { TriggerType } from '@expedition/domain';

/**
 * AU-25 — de onde a tela tira a amostra para ensaiar cada gatilho.
 *
 * Digitar era a única forma. Depois que os gatilhos de inscrição passaram a trazer contato,
 * saída e dinheiro (AU-16), isso virou dezoito caixas de texto antes de ver qualquer coisa —
 * e quem preenche dezoito campos inventados tira conclusão sobre uma automação que nunca vai
 * receber esses dados.
 *
 * Mas nem todo gatilho tem entidade para escolher, e prometer um seletor onde não há o que
 * selecionar seria trocar um defeito por outro. Por isso esta tabela existe e é dado puro: ela
 * é a única decisão da tela, e assim tem teste.
 */
export type FonteDeAmostra =
  /** Escolher uma inscrição de verdade; o servidor monta o contexto como o gatilho montaria. */
  | 'inscricao'
  /** AU-17: o relógio, sem entidade por trás — não há o que escolher numa lista. */
  | 'agora'
  /** Quem digita é a pessoa: o corpo de um webhook é de quem chama, e não há amostra nossa. */
  | 'manual';

const POR_GATILHO: Partial<Record<TriggerType, FonteDeAmostra>> = {
  booking_created: 'inscricao',
  booking_confirmed: 'inscricao',
  booking_cancelled: 'inscricao',
  payment_registered: 'inscricao',
  recurring: 'agora',
};

/*
 * Conversa e cartão do funil ficaram de fora **por enquanto**, e de propósito: os montadores do
 * servidor listam a entidade inteira do tenant e não sabem carregar um item por id. Enquanto
 * não souberem, dizer "digite" é honesto — e são gatilhos de cinco campos, que é justamente o
 * que ninguém reclamou.
 */
export function fonteDoGatilho(trigger: TriggerType | string | null): FonteDeAmostra {
  if (trigger === null) return 'manual';
  return POR_GATILHO[trigger as TriggerType] ?? 'manual';
}

/** Como cada situação de execução se lê na lista. Espelha o rótulo do log (AU-06). */
const ESTADO: Record<string, string> = {
  pending: 'na fila',
  waiting: 'esperando',
  done: 'concluída',
  failed: 'falhou',
  cancelled: 'cancelada',
};

/**
 * AU-25 — como uma execução se apresenta na lista de amostras.
 *
 * Uma lista de uuids não é escolha, é sorteio: o rótulo diz quando rodou e como terminou, que é
 * o que faz alguém reconhecer a execução em que a mensagem saiu errada.
 *
 * A que não guardou o contexto do gatilho **fica na lista**, dizendo por que não serve —
 * sumir faria a lista parecer incompleta sem explicar nada.
 */
export function rotuloDaExecucao(run: {
  createdAt: string;
  status: string;
  temContextoDoGatilho: boolean;
}): string {
  const quando = new Date(run.createdAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const situacao = ESTADO[run.status] ?? run.status;
  return run.temContextoDoGatilho
    ? `${quando} · ${situacao}`
    : `${quando} · ${situacao} · sem contexto guardado`;
}

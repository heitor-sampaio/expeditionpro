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

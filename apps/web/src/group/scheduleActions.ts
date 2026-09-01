/**
 * Ações da saída na mesa do grupo (AG-04/AG-05).
 *
 * A régua do produto: saída **sem lançamento nenhum** pode ser excluída; com lançamento,
 * só cancelada — e cancelada não some da agenda. A tela oferece as duas e desabilita a
 * que não cabe, com o motivo à vista; o servidor decide de verdade (ele também enxerga
 * os gastos com fornecedor, que a mesa não carrega).
 */

export type ScheduleActionId = 'edit' | 'cancel' | 'delete';

export interface ScheduleAction {
  readonly id: ScheduleActionId;
  readonly label: string;
  readonly enabled: boolean;
  readonly reason: string | null;
}

export interface ScheduleActionsInput {
  readonly bookingCount: number;
  readonly groupStatus: string;
}

const HAS_BOOKINGS = 'Tem inscrição lançada: cancele a saída em vez de excluir.';
const ALREADY_CANCELLED = 'Esta saída já está cancelada.';

export function resolveScheduleActions(input: ScheduleActionsInput): readonly ScheduleAction[] {
  const cancelled = input.groupStatus === 'cancelled';

  return [
    {
      id: 'edit',
      label: 'Editar datas',
      enabled: !cancelled,
      reason: cancelled ? ALREADY_CANCELLED : null,
    },
    {
      id: 'cancel',
      label: 'Cancelar saída',
      enabled: !cancelled,
      reason: cancelled ? ALREADY_CANCELLED : null,
    },
    {
      id: 'delete',
      label: 'Excluir saída',
      enabled: input.bookingCount === 0,
      reason: input.bookingCount > 0 ? HAS_BOOKINGS : null,
    },
  ];
}

export function scheduleErrorFor(code: string): string {
  switch (code) {
    case 'group_has_bookings':
      return HAS_BOOKINGS;
    case 'group_has_expenses':
      return 'Tem gasto com fornecedor lançado: cancele a saída em vez de excluir.';
    case 'already_cancelled':
      return ALREADY_CANCELLED;
    case 'invalid_date_range':
      return 'O término não pode ser antes do início.';
    case 'forbidden':
      return 'Cancelar ou excluir uma saída exige owner ou admin.';
    case 'required_field':
      return 'Escreva o motivo do cancelamento.';
    case 'missing_event':
      return 'Recarregue a página: esta tela está com dados antigos da saída.';
    case 'not_found':
      return 'Saída não encontrada — atualize a página.';
    case 'network':
      return 'Sem conexão com o servidor. Tente de novo.';
    default:
      return 'Não foi possível concluir. Tente de novo.';
  }
}

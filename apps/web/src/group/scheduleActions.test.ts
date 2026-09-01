import { describe, it, expect } from 'vitest';
import { resolveScheduleActions, scheduleErrorFor } from './scheduleActions.js';

/**
 * AG-04/AG-05 — a régua do produto: saída **sem lançamento nenhum** pode ser excluída;
 * com lançamento, só cancelada — não some. A tela oferece as duas e desabilita a que
 * não cabe, com o motivo à vista; a decisão final é sempre do servidor (que também
 * enxerga os gastos com fornecedor, invisíveis aqui).
 */
describe('AG-05: ações da saída na mesa', () => {
  it('saída vazia pode ser editada, cancelada e excluída', () => {
    const actions = resolveScheduleActions({ bookingCount: 0, groupStatus: 'open' });
    expect(actions.map((a) => a.id)).toEqual(['edit', 'cancel', 'delete']);
    expect(actions.every((a) => a.enabled)).toBe(true);
  });

  it('com inscrição, excluir sai de cena e o motivo aponta o cancelamento', () => {
    const remove = actionOf('delete', { bookingCount: 2, groupStatus: 'open' });
    expect(remove.enabled).toBe(false);
    expect(remove.reason).toBe('Tem inscrição lançada: cancele a saída em vez de excluir.');
  });

  it('saída já cancelada não cancela de novo nem tem datas editadas', () => {
    const cancel = actionOf('cancel', { bookingCount: 1, groupStatus: 'cancelled' });
    expect(cancel.enabled).toBe(false);
    expect(cancel.reason).toBe('Esta saída já está cancelada.');
    expect(actionOf('edit', { bookingCount: 1, groupStatus: 'cancelled' }).enabled).toBe(false);
  });

  it('cancelada e sem inscrição ainda pode ser excluída', () => {
    expect(actionOf('delete', { bookingCount: 0, groupStatus: 'cancelled' }).enabled).toBe(true);
  });
});

describe('AG-05: erro do servidor vira uma frase', () => {
  it.each([
    ['group_has_bookings', 'Tem inscrição lançada: cancele a saída em vez de excluir.'],
    ['group_has_expenses', 'Tem gasto com fornecedor lançado: cancele a saída em vez de excluir.'],
    ['already_cancelled', 'Esta saída já está cancelada.'],
    ['invalid_date_range', 'O término não pode ser antes do início.'],
    ['forbidden', 'Cancelar ou excluir uma saída exige owner ou admin.'],
    ['missing_event', 'Recarregue a página: esta tela está com dados antigos da saída.'],
  ])('%s', (code, message) => {
    expect(scheduleErrorFor(code)).toBe(message);
  });

  it('código desconhecido cai numa frase acionável', () => {
    expect(scheduleErrorFor('boom')).toBe('Não foi possível concluir. Tente de novo.');
  });
});

function actionOf(
  id: 'edit' | 'cancel' | 'delete',
  input: { bookingCount: number; groupStatus: string },
) {
  const action = resolveScheduleActions(input).find((a) => a.id === id);
  if (!action) throw new Error(`ação ${id} não oferecida`);
  return action;
}

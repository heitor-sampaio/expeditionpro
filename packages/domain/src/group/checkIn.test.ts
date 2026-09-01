import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '../date/localDate.js';
import { checkInAvailability } from './checkIn.js';

/**
 * GR-14 — check-in da inscrição. É a presença na saída, então só existe **durante** a
 * saída: antes do embarque não há o que confirmar, e depois do fim já passou.
 *
 * As duas audiências não têm a mesma régua (decisão do dono do produto): o cliente só
 * faz check-in de inscrição confirmada; a equipe faz também da pendente, porque quem
 * cobra no local é ela.
 */

const SAIDA = { startDate: parseLocalDate('2026-11-10'), endDate: parseLocalDate('2026-11-14') };

function estado(over: Partial<Parameters<typeof checkInAvailability>[0]> = {}) {
  return checkInAvailability({
    status: 'confirmed',
    alreadyCheckedIn: false,
    audience: 'customer',
    today: parseLocalDate('2026-11-10'),
    ...SAIDA,
    ...over,
  });
}

describe('GR-14: quando dá para fazer check-in', () => {
  it('no primeiro e no último dia da saída, inclusive', () => {
    expect(estado({ today: parseLocalDate('2026-11-10') })).toEqual({ allowed: true });
    expect(estado({ today: parseLocalDate('2026-11-14') })).toEqual({ allowed: true });
  });

  it('não na véspera nem depois do fim', () => {
    expect(estado({ today: parseLocalDate('2026-11-09') })).toEqual({
      allowed: false,
      reason: 'not_started',
    });
    expect(estado({ today: parseLocalDate('2026-11-15') })).toEqual({
      allowed: false,
      reason: 'already_over',
    });
  });

  it('o cliente precisa da inscrição confirmada; a equipe faz da pendente também', () => {
    expect(estado({ status: 'pending' })).toEqual({ allowed: false, reason: 'not_confirmed' });
    expect(estado({ status: 'pending', audience: 'team' })).toEqual({ allowed: true });
  });

  it('inscrição cancelada ou recusada não faz check-in, nem pela equipe', () => {
    expect(estado({ status: 'cancelled', audience: 'team' })).toEqual({
      allowed: false,
      reason: 'cancelled',
    });
    expect(estado({ status: 'rejected' })).toEqual({ allowed: false, reason: 'cancelled' });
  });

  it('check-in já feito não se repete', () => {
    expect(estado({ alreadyCheckedIn: true })).toEqual({
      allowed: false,
      reason: 'already_checked_in',
    });
  });

  it('a saída acabar não some com o check-in que já existe', () => {
    expect(estado({ alreadyCheckedIn: true, today: parseLocalDate('2026-12-01') })).toEqual({
      allowed: false,
      reason: 'already_checked_in',
    });
  });
});

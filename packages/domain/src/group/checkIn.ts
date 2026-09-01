import { compareLocalDate, type LocalDate } from '../date/localDate.js';

/**
 * GR-14 — a regra do check-in, pura: dado o estado da inscrição, a janela da saída e
 * quem está pedindo, dá ou não dá. A data de hoje **entra como parâmetro** — nada de
 * `new Date()` aqui dentro (§3.4: fuso implícito é bug de data).
 *
 * Duas réguas por audiência, decisão do dono do produto: o cliente só faz check-in de
 * inscrição confirmada; a equipe faz também da pendente, porque é ela que cobra no local.
 */

export type CheckInAudience = 'customer' | 'team';

export type CheckInBlock =
  'cancelled' | 'already_checked_in' | 'not_started' | 'already_over' | 'not_confirmed';

export type CheckInAvailability =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: CheckInBlock;
    };

export interface CheckInState {
  readonly status: string;
  readonly alreadyCheckedIn: boolean;
  readonly audience: CheckInAudience;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly today: LocalDate;
}

export function checkInAvailability(state: CheckInState): CheckInAvailability {
  if (state.status === 'cancelled' || state.status === 'rejected') {
    return { allowed: false, reason: 'cancelled' };
  }
  // Antes da janela: um check-in que já existe continua valendo depois que a saída acaba,
  // então este teste vem antes do calendário.
  if (state.alreadyCheckedIn) {
    return { allowed: false, reason: 'already_checked_in' };
  }
  if (compareLocalDate(state.today, state.startDate) < 0) {
    return { allowed: false, reason: 'not_started' };
  }
  if (compareLocalDate(state.today, state.endDate) > 0) {
    return { allowed: false, reason: 'already_over' };
  }
  if (state.audience === 'customer' && state.status !== 'confirmed') {
    return { allowed: false, reason: 'not_confirmed' };
  }
  return { allowed: true };
}

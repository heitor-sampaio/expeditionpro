import { subCents, sumCents, type Cents } from '../money/cents.js';

/**
 * Leitura do grupo — Tabela 1 (§5.5, GR-07/GR-13). Os totais são **derivados** das
 * inscrições, nunca coluna. Confirmado e projetado (confirmado + pendente) andam
 * separados para não inflar a previsão de caixa; cancelada e recusada não somam.
 * Só inscrição confirmada ocupa vaga (GR-12).
 */

export interface GroupBoardBookingInput {
  readonly bookingId: string;
  readonly status: string; // pending | confirmed | cancelled | rejected
  readonly contractedCents: Cents; // soma dos unitários congelados
  readonly receivedCents: Cents; // soma dos recebimentos (0 até o ledger da Fase 3)
}

export interface GroupBoardBookingLine extends GroupBoardBookingInput {
  readonly dueCents: Cents; // a receber = contratado - recebido
  readonly occupiesVehicle: boolean; // GR-12: só confirmada ocupa
}

export interface GroupBoardSummary {
  readonly lines: readonly GroupBoardBookingLine[];
  readonly contractedConfirmedCents: Cents;
  readonly contractedProjectedCents: Cents;
  readonly receivedCents: Cents;
  readonly dueConfirmedCents: Cents;
  readonly dueProjectedCents: Cents;
  readonly confirmedCount: number;
  readonly pendingCount: number;
  readonly occupiedVehicles: number;
}

export function summarizeGroupBoard(
  bookings: readonly GroupBoardBookingInput[],
): GroupBoardSummary {
  const lines: GroupBoardBookingLine[] = bookings.map((booking) => ({
    ...booking,
    dueCents: subCents(booking.contractedCents, booking.receivedCents),
    occupiesVehicle: booking.status === 'confirmed',
  }));

  const confirmed = lines.filter((line) => line.status === 'confirmed');
  const pending = lines.filter((line) => line.status === 'pending');
  const projected = [...confirmed, ...pending];

  const contractedConfirmedCents = sumCents(confirmed.map((line) => line.contractedCents));
  const contractedProjectedCents = sumCents(projected.map((line) => line.contractedCents));
  const receivedConfirmedCents = sumCents(confirmed.map((line) => line.receivedCents));
  const receivedCents = sumCents(projected.map((line) => line.receivedCents));

  return {
    lines,
    contractedConfirmedCents,
    contractedProjectedCents,
    receivedCents,
    dueConfirmedCents: subCents(contractedConfirmedCents, receivedConfirmedCents),
    dueProjectedCents: subCents(contractedProjectedCents, receivedCents),
    confirmedCount: confirmed.length,
    pendingCount: pending.length,
    occupiedVehicles: confirmed.length,
  };
}

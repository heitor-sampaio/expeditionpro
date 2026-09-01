import { describe, it, expect } from 'vitest';
import { cents } from '../money/cents.js';
import { summarizeGroupBoard, type GroupBoardBookingInput } from './groupBoard.js';

/**
 * GR-07/GR-13: os totais do grupo são derivados das inscrições, nunca coluna.
 * Confirmado e projetado (confirmado + pendente) andam separados para não inflar
 * a previsão de caixa. Cancelada e recusada não entram em nenhum total.
 */

const b = (status: string, contracted: number, received = 0): GroupBoardBookingInput => ({
  bookingId: `bk-${status}-${contracted}`,
  status,
  contractedCents: cents(contracted),
  receivedCents: cents(received),
});

describe('GR-13: summarizeGroupBoard separa confirmado de projetado', () => {
  it('contratado confirmado soma só as confirmadas; projetado soma confirmadas + pendentes', () => {
    const s = summarizeGroupBoard([b('confirmed', 200000), b('pending', 160000)]);
    expect(s.contractedConfirmedCents).toBe(200000);
    expect(s.contractedProjectedCents).toBe(360000);
    expect(s.confirmedCount).toBe(1);
    expect(s.pendingCount).toBe(1);
  });

  it('cancelada e recusada não entram em nenhum total', () => {
    const s = summarizeGroupBoard([
      b('confirmed', 200000),
      b('cancelled', 999999),
      b('rejected', 888888),
    ]);
    expect(s.contractedConfirmedCents).toBe(200000);
    expect(s.contractedProjectedCents).toBe(200000);
  });

  it('GR-07: a receber = contratado - recebido, por bucket', () => {
    const s = summarizeGroupBoard([b('confirmed', 200000, 50000), b('pending', 160000, 0)]);
    expect(s.receivedCents).toBe(50000);
    expect(s.dueConfirmedCents).toBe(150000); // 200000 - 50000
    expect(s.dueProjectedCents).toBe(310000); // 360000 - 50000
  });

  it('a receber por linha = contratado - recebido', () => {
    const s = summarizeGroupBoard([b('confirmed', 200000, 50000)]);
    expect(s.lines[0]!.dueCents).toBe(150000);
  });

  it('GR-12: só confirmada ocupa vaga', () => {
    const s = summarizeGroupBoard([
      b('confirmed', 100000),
      b('pending', 100000),
      b('confirmed', 100000),
    ]);
    expect(s.occupiedVehicles).toBe(2);
    expect(s.lines.find((l) => l.status === 'pending')!.occupiesVehicle).toBe(false);
    expect(s.lines.filter((l) => l.status === 'confirmed').every((l) => l.occupiesVehicle)).toBe(
      true,
    );
  });

  it('grupo vazio: tudo zero', () => {
    const s = summarizeGroupBoard([]);
    expect(s.contractedConfirmedCents).toBe(0);
    expect(s.contractedProjectedCents).toBe(0);
    expect(s.receivedCents).toBe(0);
    expect(s.occupiedVehicles).toBe(0);
    expect(s.lines).toEqual([]);
  });
});

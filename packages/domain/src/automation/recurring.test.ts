import { describe, expect, it } from 'vitest';
import { INTERVALO_MINIMO_MIN, intervaloEmMinutos, janelaDe } from './recurring.js';

/**
 * AU-17 — o gatilho de tempo em tempo, sem despertador e sem estado.
 *
 * A prova que importa é a da fatia: duas varreduras dentro do mesmo intervalo têm que devolver
 * o mesmo número, porque é ele que vira a chave de idempotência. Se variasse, "a cada seis
 * horas" viraria "a cada minuto" — a varredura de rede passa de sessenta em sessenta segundos,
 * e cada passada abriria uma execução nova.
 */

const cada = (amount: number, unit: string) => ({ amount, unit });

describe('AU-17: o intervalo pedido', () => {
  it('converte hora e dia em minutos', () => {
    expect(intervaloEmMinutos(cada(6, 'hours'))).toBe(360);
    expect(intervaloEmMinutos(cada(2, 'days'))).toBe(2880);
    expect(intervaloEmMinutos(cada(15, 'minutes'))).toBe(15);
  });

  /** Sem o piso, de propósito: quem recusa "a cada 30 segundos" é o validador do grafo. */
  it('devolve o que foi pedido, mesmo abaixo do piso', () => {
    expect(intervaloEmMinutos({ amount: 0.5, unit: 'minutes' })).toBe(0.5);
  });

  it('configuração torta é zero, e o grafo recusa', () => {
    expect(intervaloEmMinutos({})).toBe(0);
    expect(intervaloEmMinutos({ amount: -3, unit: 'hours' })).toBe(0);
  });
});

describe('AU-17: a fatia de tempo', () => {
  it('duas passadas dentro do mesmo intervalo caem na mesma fatia', () => {
    const config = cada(6, 'hours');

    expect(janelaDe(config, new Date('2026-09-03T12:00:00Z'))).toBe(
      janelaDe(config, new Date('2026-09-03T17:59:00Z')),
    );
  });

  it('passado o intervalo, a fatia avança', () => {
    const config = cada(6, 'hours');

    expect(janelaDe(config, new Date('2026-09-03T18:00:00Z'))).toBe(
      janelaDe(config, new Date('2026-09-03T12:00:00Z')) + 1,
    );
  });

  it('a cada minuto, cada minuto é uma fatia', () => {
    const config = cada(1, 'minutes');

    expect(janelaDe(config, new Date('2026-09-03T12:01:00Z'))).toBe(
      janelaDe(config, new Date('2026-09-03T12:00:30Z')) + 1,
    );
  });

  /** Intervalo abaixo do piso executa no piso, em vez de virar disparo a cada varredura. */
  it('meio minuto vira um minuto', () => {
    expect(janelaDe({ amount: 0.5, unit: 'minutes' }, new Date('2026-09-03T12:00:30Z'))).toBe(
      janelaDe({ amount: 1, unit: 'minutes' }, new Date('2026-09-03T12:00:30Z')),
    );
  });

  it('o piso está declarado, e é o mesmo da espera', () => {
    expect(INTERVALO_MINIMO_MIN).toBe(1);
  });
});

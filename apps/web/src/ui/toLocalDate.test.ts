import { describe, expect, it } from 'vitest';
import { toLocalDate } from './toLocalDate.js';

/**
 * O "hoje" que a tela usa para liberar o check-in é o do relógio do usuário, no fuso
 * dele. Converter por UTC daria o dia errado antes das 21h no Brasil — e a saída começa
 * de manhã.
 */
describe('data de hoje na tela: fuso local, não UTC', () => {
  it('usa ano, mês e dia locais', () => {
    const meioDia = new Date(2026, 10, 10, 12, 0, 0); // 10/11/2026, hora local
    expect(toLocalDate(meioDia)).toEqual({ year: 2026, month: 11, day: 10 });
  });

  it('a virada da noite ainda é o dia local, não o do UTC', () => {
    const quaseMeiaNoite = new Date(2026, 10, 10, 23, 30, 0);
    expect(toLocalDate(quaseMeiaNoite)).toEqual({ year: 2026, month: 11, day: 10 });
  });
});

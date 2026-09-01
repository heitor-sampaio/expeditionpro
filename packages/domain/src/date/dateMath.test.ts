import { describe, it, expect } from 'vitest';
import { addDays, addMonths, parseLocalDate } from './localDate.js';

describe('aritmética de data civil (para liberação/validade do cashback)', () => {
  it('addDays cruza o fim do mês', () => {
    expect(addDays(parseLocalDate('2025-11-14'), 30)).toEqual(parseLocalDate('2025-12-14'));
    expect(addDays(parseLocalDate('2025-12-31'), 1)).toEqual(parseLocalDate('2026-01-01'));
  });

  it('addMonths avança o ano e ajusta dia inexistente', () => {
    expect(addMonths(parseLocalDate('2025-11-10'), 12)).toEqual(parseLocalDate('2026-11-10'));
    expect(addMonths(parseLocalDate('2025-01-31'), 1)).toEqual(parseLocalDate('2025-02-28'));
  });

  it('addMonths(0) é identidade', () => {
    expect(addMonths(parseLocalDate('2025-06-15'), 0)).toEqual(parseLocalDate('2025-06-15'));
  });
});

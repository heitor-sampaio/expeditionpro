import { describe, it, expect } from 'vitest';
import { resolveAudience, TEAM_ROLES } from './resolveAudience.js';

describe('§3.7 / A01: a audiência decide a casca a partir do papel (fail-closed)', () => {
  it('cliente com customer_id → portal', () => {
    expect(resolveAudience('customer', 'cust-1')).toBe('portal');
  });

  it('cliente sem customer_id → acesso negado (nunca abre casca)', () => {
    expect(resolveAudience('customer', null)).toBe('denied');
  });

  it.each(TEAM_ROLES)('papel de equipe %s → back-office', (role) => {
    expect(resolveAudience(role, null)).toBe('backoffice');
  });

  it('A01: sessão sem papel NÃO cai no back-office → acesso negado', () => {
    expect(resolveAudience(null, null)).toBe('denied');
  });

  it('A01: papel desconhecido → acesso negado', () => {
    expect(resolveAudience('superuser', null)).toBe('denied');
  });

  it('A01: papel desconhecido não vira portal mesmo com customer_id presente', () => {
    expect(resolveAudience('hacker', 'cust-9')).toBe('denied');
  });
});

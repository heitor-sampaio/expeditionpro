import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '../date/localDate.js';
import { detectCustomerDivergence, hasDivergence } from './detectCustomerDivergence.js';
import type { CustomerFacts } from './detectCustomerDivergence.js';

/**
 * IN-04 — um CPF já cadastrado chega na inscrição com nome, nascimento, telefone ou
 * e-mail diferentes. Esta função pura diz o que divergiu (o valor proposto por campo),
 * para virar pedido na fila de revisão. Não decide nada nem sobrescreve: só compara.
 */
describe('IN-04: detecção de divergência de dados do cliente', () => {
  const current: CustomerFacts = {
    fullName: 'Heitor Sampaio',
    birthDate: parseLocalDate('1989-01-14'),
    email: 'heitor@exemplo.com',
    phone: '48999998877',
  };

  it('sem diferença nenhuma → nada diverge', () => {
    const d = detectCustomerDivergence(current, { ...current });
    expect(hasDivergence(d)).toBe(false);
    expect(d).toEqual({ fullName: null, birthDate: null, email: null, phone: null });
  });

  it('nome diferente entra como valor proposto (trim preservando a grafia recebida)', () => {
    const d = detectCustomerDivergence(current, { ...current, fullName: '  Heitor R. Sampaio  ' });
    expect(d.fullName).toBe('Heitor R. Sampaio');
    expect(hasDivergence(d)).toBe(true);
  });

  it('só caixa/acento/espaço no nome não é divergência', () => {
    const d = detectCustomerDivergence(current, { ...current, fullName: 'heitor  sampáio' });
    expect(d.fullName).toBeNull();
    expect(hasDivergence(d)).toBe(false);
  });

  it('nascimento diferente entra como valor proposto', () => {
    const d = detectCustomerDivergence(current, {
      ...current,
      birthDate: parseLocalDate('1989-01-15'),
    });
    expect(d.birthDate).toEqual({ year: 1989, month: 1, day: 15 });
    expect(hasDivergence(d)).toBe(true);
  });

  it('telefone diferente (comparado só por dígitos) entra como proposto', () => {
    const d = detectCustomerDivergence(current, { ...current, phone: '48 99999-0000' });
    expect(d.phone).toBe('48 99999-0000');
    expect(hasDivergence(d)).toBe(true);
  });

  it('telefone com a mesma sequência de dígitos, só formatado, não diverge', () => {
    const d = detectCustomerDivergence(current, { ...current, phone: '(48) 99999-8877' });
    expect(d.phone).toBeNull();
  });

  it('e-mail diferente (case-insensitive) entra como proposto', () => {
    const d = detectCustomerDivergence(current, { ...current, email: 'novo@exemplo.com' });
    expect(d.email).toBe('novo@exemplo.com');
  });

  it('mesmo e-mail em caixa diferente não diverge', () => {
    const d = detectCustomerDivergence(current, { ...current, email: 'Heitor@Exemplo.com' });
    expect(d.email).toBeNull();
  });

  it('campo vindo vazio nunca propõe apagar o que já existe', () => {
    const d = detectCustomerDivergence(current, { ...current, email: '', phone: '   ' });
    expect(d.email).toBeNull();
    expect(d.phone).toBeNull();
    expect(hasDivergence(d)).toBe(false);
  });

  it('contato antes ausente que agora chega preenchido é proposto', () => {
    const semContato: CustomerFacts = { ...current, email: null, phone: null };
    const d = detectCustomerDivergence(semContato, {
      ...current,
      email: 'novo@exemplo.com',
      phone: '48999998877',
    });
    expect(d.email).toBe('novo@exemplo.com');
    expect(d.phone).toBe('48999998877');
    expect(hasDivergence(d)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { whatsappLink } from './whatsapp.js';

/**
 * O link de conversa é a mesma coisa nas duas pontas: a equipe fala com o responsável
 * pela fila, e o cliente fala com a equipe pelo portal.
 */
describe('WhatsApp: link de conversa com texto pronto', () => {
  it('monta wa.me com o número e o texto escapado', () => {
    expect(whatsappLink('5548999998877', 'Olá, tudo bem?')).toBe(
      'https://wa.me/5548999998877?text=Ol%C3%A1%2C%20tudo%20bem%3F',
    );
  });

  it('aceita número com máscara — o wa.me só entende dígitos', () => {
    expect(whatsappLink('(48) 99999-8877', 'oi')).toBe('https://wa.me/48999998877?text=oi');
  });
});

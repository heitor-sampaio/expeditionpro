import { describe, expect, it } from 'vitest';
import { renderTemplate } from './renderTemplate.js';

/**
 * AU-09 — as variáveis dentro do texto que vai para o cliente.
 *
 * A regra que decide tudo: **variável que não existe vira vazio, nunca o marcador cru**. O erro
 * de quem escreveu a automação não pode virar "Bom dia, {{contato.nome}}" no WhatsApp de um
 * cliente — quem paga o vexame é a empresa, não quem digitou.
 */
describe('AU-09: variáveis no texto', () => {
  const contexto = {
    contato: { nome: 'Ana Prado', telefone: '5548999998877' },
    oportunidade: { etapa: 'Proposta enviada', valor: 0 },
  };

  it('troca a variável pelo valor', () => {
    expect(renderTemplate('Bom dia, {{contato.nome}}!', contexto)).toBe('Bom dia, Ana Prado!');
  });

  it('troca várias na mesma frase', () => {
    expect(renderTemplate('{{contato.nome}} está em {{oportunidade.etapa}}', contexto)).toBe(
      'Ana Prado está em Proposta enviada',
    );
  });

  it('espaço em volta do nome não atrapalha — ninguém digita igual', () => {
    expect(renderTemplate('Oi, {{ contato.nome }}', contexto)).toBe('Oi, Ana Prado');
  });

  it('variável que não existe some, e a frase continua legível', () => {
    expect(renderTemplate('Oi, {{contato.apelido}}!', contexto)).toBe('Oi, !');
  });

  it('caminho que atravessa coisa que não é objeto também some', () => {
    expect(renderTemplate('{{contato.nome.sobrenome}}', contexto)).toBe('');
  });

  it('número vira texto', () => {
    expect(renderTemplate('valor {{oportunidade.valor}}', contexto)).toBe('valor 0');
  });

  it('texto sem variável nenhuma passa intacto', () => {
    expect(renderTemplate('Bom dia!', contexto)).toBe('Bom dia!');
  });

  /**
   * O que vem do contexto é dado de terceiro — nome de contato veio do WhatsApp. Ele entra
   * como texto e nunca como marcador: não há substituição recursiva, então um contato chamado
   * `{{contato.telefone}}` não vira o telefone de ninguém.
   */
  it('valor que parece marcador não é substituído de novo', () => {
    const malicioso = { contato: { nome: '{{contato.telefone}}', telefone: '5548999998877' } };
    expect(renderTemplate('Oi, {{contato.nome}}', malicioso)).toBe('Oi, {{contato.telefone}}');
  });

  it('chave sem par fica como está — é texto, não marcação', () => {
    expect(renderTemplate('desconto de {{50', contexto)).toBe('desconto de {{50');
  });
});

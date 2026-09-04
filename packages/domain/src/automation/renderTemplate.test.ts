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

/**
 * AU-22 — funções dentro do marcador.
 *
 * Substituir crua não basta para escrever uma frase decente: "sua saída é dia 2026-10-10" e
 * "Oi, Ana Prado Silva" são o que sai hoje, e nenhuma das duas é o que se manda para um
 * cliente. As funções são **nomeadas e poucas**, de propósito — expressão que aceita qualquer
 * coisa vira código, e código dentro de um campo de texto é código sem revisão e sem teste.
 */
describe('AU-22: funções no texto', () => {
  const contexto = {
    contato: { nome: 'ana prado silva', telefone: '5548999998877' },
    saida: { inicio: '2026-10-10' },
    inscricao: { totalCentavos: 258000 },
  };
  const hoje = new Date('2026-10-07T12:00:00.000Z');

  it('primeiro nome tira o resto', () => {
    expect(renderTemplate('Oi, {{primeiroNome(contato.nome)}}!', contexto)).toBe('Oi, ana!');
  });

  it('capitaliza nome próprio, e as preposições ficam minúsculas', () => {
    expect(renderTemplate('{{nomeProprio(contato.nome)}}', contexto)).toBe('Ana Prado Silva');
    expect(renderTemplate('{{nomeProprio("joao da silva")}}', contexto)).toBe('Joao da Silva');
  });

  it('data em português', () => {
    expect(renderTemplate('Saída em {{data(saida.inicio)}}', contexto)).toBe('Saída em 10/10/2026');
  });

  it('dias até a data, contando de hoje', () => {
    expect(renderTemplate('faltam {{diasAte(saida.inicio)}} dias', contexto, { agora: hoje })).toBe(
      'faltam 3 dias',
    );
  });

  /** Dinheiro é centavos no sistema inteiro; escrever "R$ 258000" seria o erro mais caro. */
  it('dinheiro sai em reais, a partir de centavos', () => {
    expect(renderTemplate('{{dinheiro(inscricao.totalCentavos)}}', contexto)).toBe('R$ 2.580,00');
  });

  it('padrão cobre o campo vazio', () => {
    expect(renderTemplate('Oi, {{padrao(contato.apelido, "tudo bem")}}!', contexto)).toBe(
      'Oi, tudo bem!',
    );
    expect(renderTemplate('{{padrao(contato.telefone, "sem telefone")}}', contexto)).toBe(
      '5548999998877',
    );
  });

  it('maiúscula e minúscula', () => {
    expect(renderTemplate('{{maiuscula(contato.nome)}}', contexto)).toBe('ANA PRADO SILVA');
    expect(renderTemplate('{{minuscula("GRITANDO")}}', contexto)).toBe('gritando');
  });

  /** AU-09 continua valendo: o que não dá certo vira vazio, nunca o marcador na cara do cliente. */
  it('função desconhecida vira vazio', () => {
    expect(renderTemplate('[{{inventada(contato.nome)}}]', contexto)).toBe('[]');
  });

  it('argumento que não existe vira vazio, e a função lida com isso', () => {
    expect(renderTemplate('[{{primeiroNome(nao.existe)}}]', contexto)).toBe('[]');
    expect(renderTemplate('[{{data(nao.existe)}}]', contexto)).toBe('[]');
  });

  it('sem relógio, o que depende de data vira vazio em vez de mentir', () => {
    expect(renderTemplate('[{{diasAte(saida.inicio)}}]', contexto)).toBe('[]');
  });

  it('a substituição continua sendo de uma passada só', () => {
    const malicioso = { contato: { nome: '{{contato.telefone}}' }, telefone: '5548999998877' };
    expect(renderTemplate('{{primeiroNome(contato.nome)}}', malicioso)).toBe(
      '{{contato.telefone}}',
    );
  });
});

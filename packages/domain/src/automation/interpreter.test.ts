import { describe, expect, it } from 'vitest';
import {
  evaluateCondition,
  readPath,
  resolveDelay,
  resolveSwitch,
  switchCases,
  ESPERA_MINIMA_MIN,
} from './interpreter.js';

/**
 * AU-01 · AU-07 — as decisões que o motor toma, sem ser o motor.
 *
 * Tudo aqui é função pura: dado o contexto da execução e a configuração do bloco, qual é a
 * saída. Quem lê o banco, chama o provedor e grava o passo é a camada de aplicação; ela não
 * decide nada. É essa separação que permite testar "mensagem contendo preço vai pelo sim"
 * sem subir Postgres, sem relógio e sem React.
 *
 * A data e a hora **entram como parâmetro**. Espera que dependesse de `new Date()` seria
 * intestável e quebraria na virada do dia — o pior tipo de teste instável.
 */

const contexto = {
  contato: { nome: 'Ana Prado', telefone: '5548999998877' },
  mensagem: { texto: 'Bom dia! Quanto custa a Coxilha Rica?' },
  oportunidade: { etapa: 'Primeiro contato' },
};

describe('AU-01: ler um campo do contexto', () => {
  it('caminho com ponto desce na estrutura', () => {
    expect(readPath(contexto, 'contato.nome')).toBe('Ana Prado');
  });

  /** Campo que não existe é vazio, nunca `undefined` vazando para a comparação. */
  it('caminho inexistente vira vazio', () => {
    expect(readPath(contexto, 'contato.sobrenome')).toBe('');
    expect(readPath(contexto, 'nada.de.nada')).toBe('');
  });

  it('caminho vazio vira vazio, em vez de devolver o contexto inteiro', () => {
    expect(readPath(contexto, '')).toBe('');
  });

  it('número vira texto — a comparação é sempre entre textos', () => {
    expect(readPath({ inscricao: { pessoas: 4 } }, 'inscricao.pessoas')).toBe('4');
  });
});

describe('AU-01: a condição escolhe o lado', () => {
  /** "contém" ignora caixa e acento: quem escreve "preço" espera pegar "PRECO" também. */
  it('contém ignora caixa e acento', () => {
    const config = { field: 'mensagem.texto', operator: 'contains', value: 'PRECO' };
    expect(evaluateCondition(config, { mensagem: { texto: 'quanto custa o preço?' } })).toBe(true);
  });

  it('contém devolve não quando não acha', () => {
    const config = { field: 'mensagem.texto', operator: 'contains', value: 'boleto' };
    expect(evaluateCondition(config, contexto)).toBe(false);
  });

  it('é igual compara o texto inteiro, também sem caixa nem acento', () => {
    const config = { field: 'oportunidade.etapa', operator: 'equals', value: 'primeiro contato' };
    expect(evaluateCondition(config, contexto)).toBe(true);
  });

  it('é diferente é o contrário de é igual', () => {
    const config = { field: 'oportunidade.etapa', operator: 'not_equals', value: 'Fechado' };
    expect(evaluateCondition(config, contexto)).toBe(true);
  });

  it('está vazio pega campo ausente e campo só com espaço', () => {
    const config = { field: 'contato.email', operator: 'empty', value: '' };
    expect(evaluateCondition(config, contexto)).toBe(true);
    expect(evaluateCondition(config, { contato: { email: '   ' } })).toBe(true);
    expect(evaluateCondition(config, { contato: { email: 'a@b.c' } })).toBe(false);
  });

  it('não está vazio é o contrário', () => {
    const config = { field: 'contato.nome', operator: 'not_empty', value: '' };
    expect(evaluateCondition(config, contexto)).toBe(true);
  });

  /**
   * Operador que o motor não conhece devolve **não**, e não explode. Um bloco salvo por uma
   * versão mais nova do editor não pode derrubar a execução — ele desvia pelo lado seguro.
   */
  it('operador desconhecido devolve não, sem explodir', () => {
    const config = { field: 'contato.nome', operator: 'faz_magica', value: 'x' };
    expect(evaluateCondition(config, contexto)).toBe(false);
  });

  it('condição sem campo devolve não — meia configuração não decide nada', () => {
    expect(evaluateCondition({ operator: 'contains', value: 'x' }, contexto)).toBe(false);
  });
});

describe('AU-07: a espera resolve para um instante', () => {
  const agora = new Date('2026-09-03T12:00:00.000Z');

  it('dias somam dias', () => {
    const quando = resolveDelay({ amount: 3, unit: 'days' }, agora);
    expect(quando.toISOString()).toBe('2026-09-06T12:00:00.000Z');
  });

  it('horas somam horas', () => {
    expect(resolveDelay({ amount: 2, unit: 'hours' }, agora).toISOString()).toBe(
      '2026-09-03T14:00:00.000Z',
    );
  });

  it('minutos somam minutos', () => {
    expect(resolveDelay({ amount: 90, unit: 'minutes' }, agora).toISOString()).toBe(
      '2026-09-03T13:30:00.000Z',
    );
  });

  /**
   * O piso existe porque a varredura de rede é de um minuto: espera menor que isso seria
   * imprecisa e mentiria para quem desenhou. E automação que espera trinta segundos para
   * mandar outra mensagem é quase sempre engano, não desenho.
   */
  it('espera menor que o piso sobe para o piso', () => {
    expect(resolveDelay({ amount: 0.5, unit: 'minutes' }, agora).toISOString()).toBe(
      '2026-09-03T12:01:00.000Z',
    );
  });

  it('espera ausente ou zero também vira o piso, em vez de rodar na hora', () => {
    expect(resolveDelay({}, agora).toISOString()).toBe('2026-09-03T12:01:00.000Z');
    expect(resolveDelay({ amount: 0, unit: 'days' }, agora).toISOString()).toBe(
      '2026-09-03T12:01:00.000Z',
    );
  });

  it('unidade desconhecida cai em minutos, o mais curto — nunca em dias por engano', () => {
    expect(resolveDelay({ amount: 5, unit: 'luas' }, agora).toISOString()).toBe(
      '2026-09-03T12:05:00.000Z',
    );
  });

  it('o piso está declarado, para o validador de grafo usar o mesmo número', () => {
    expect(ESPERA_MINIMA_MIN).toBe(1);
  });
});

/**
 * AU-15 — por onde sai uma escolha múltipla.
 *
 * A mesma normalização da condição: quem escreve "preço" na regra espera pegar "PRECO"
 * digitado às pressas no celular. O que não casa com valor nenhum vai pelo padrão — nunca
 * fica parado, porque execução que para sem motivo é a que ninguém descobre.
 */
describe('AU-15: a saída de uma escolha múltipla', () => {
  const config = {
    field: 'mensagem.texto',
    cases: [
      { id: 'c1', value: 'preço' },
      { id: 'c2', value: 'data' },
    ],
  };

  it('casa o valor e sai pela porta daquele caso', () => {
    expect(resolveSwitch(config, { mensagem: { texto: 'qual o preço?' } })).toBe('case_c1');
  });

  it('sem caixa e sem acento, como a condição', () => {
    expect(resolveSwitch(config, { mensagem: { texto: 'QUAL O PRECO?' } })).toBe('case_c1');
  });

  it('o primeiro valor que casa ganha, e a ordem é a da lista', () => {
    expect(resolveSwitch(config, { mensagem: { texto: 'preço e data da saída' } })).toBe('case_c1');
  });

  it('o que não casa com nada vai pelo padrão', () => {
    expect(resolveSwitch(config, { mensagem: { texto: 'bom dia' } })).toBe('default');
  });

  it('campo vazio vai pelo padrão, em vez de casar com valor vazio', () => {
    expect(resolveSwitch(config, {})).toBe('default');
    expect(resolveSwitch({ ...config, field: '' }, { mensagem: { texto: 'preço' } })).toBe(
      'default',
    );
  });

  /** Configuração torta vem de grafo salvo por outra versão do editor: desvia, não explode. */
  it('lista de casos ausente vai pelo padrão', () => {
    expect(resolveSwitch({ field: 'mensagem.texto' }, { mensagem: { texto: 'preço' } })).toBe(
      'default',
    );
  });
});

describe('AU-15: os casos de uma escolha múltipla', () => {
  it('lê a lista com id e valor', () => {
    expect(switchCases({ cases: [{ id: 'c1', value: 'preço' }] })).toEqual([
      { id: 'c1', value: 'preço' },
    ]);
  });

  it('descarta caso sem id: sem ele não há porta para ligar', () => {
    expect(switchCases({ cases: [{ value: 'preço' }, { id: 'c2', value: 'data' }] })).toEqual([
      { id: 'c2', value: 'data' },
    ]);
  });

  it('configuração sem lista é lista vazia', () => {
    expect(switchCases({})).toEqual([]);
    expect(switchCases({ cases: 'preço' })).toEqual([]);
  });
});

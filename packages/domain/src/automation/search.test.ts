import { describe, expect, it } from 'vitest';
import {
  CATALOGO_DE_BUSCA,
  entityFieldsOf,
  listItems,
  listName,
  matchesFilters,
  searchEntityOf,
  searchFilters,
  searchMode,
  SEARCH_ENTITIES,
} from './search.js';

/**
 * AU-18 — a busca é um mecanismo, não uma pergunta pronta.
 *
 * O catálogo diz sobre o que dá para iterar e com que campos; quem monta a pergunta é a equipe,
 * combinando campo, operador e valor. O que se cobra aqui é que essa combinação decida **igual**
 * ao bloco "Se" — senão filtrar e perguntar discordam, e o fluxo faz coisa diferente do que o
 * quadro mostra.
 */

const cardParado = {
  oportunidade: { etapa: 'Primeiro contato', paradaHaMin: 45, fechada: false },
  contato: { nome: 'Ana Prado' },
};

describe('AU-18: o catálogo de entidades', () => {
  it('toda entidade declarada tem rótulo e campos', () => {
    for (const entidade of SEARCH_ENTITIES) {
      expect(CATALOGO_DE_BUSCA[entidade].label.length).toBeGreaterThan(0);
      expect(CATALOGO_DE_BUSCA[entidade].fields.length).toBeGreaterThan(0);
    }
  });

  it('não há caminho repetido dentro de uma entidade', () => {
    for (const entidade of SEARCH_ENTITIES) {
      const caminhos = CATALOGO_DE_BUSCA[entidade].fields.map((campo) => campo.path);
      expect(new Set(caminhos).size, entidade).toBe(caminhos.length);
    }
  });

  it('os cards do funil trazem etapa e tempo parado', () => {
    const caminhos = CATALOGO_DE_BUSCA.opportunities.fields.map((campo) => campo.path);
    expect(caminhos).toContain('oportunidade.etapa');
    expect(caminhos).toContain('oportunidade.paradaHaMin');
  });

  it('entidade desconhecida não promete campo nenhum', () => {
    expect(searchEntityOf({ entity: 'inventada' })).toBeNull();
    expect(entityFieldsOf({ entity: 'inventada' })).toEqual([]);
  });

  it('os campos vêm da entidade escolhida', () => {
    expect(entityFieldsOf({ entity: 'conversations' })).toEqual(
      CATALOGO_DE_BUSCA.conversations.fields,
    );
  });
});

describe('AU-18: os filtros do bloco', () => {
  const filtro = (field: string, operator: string, value: string) => ({
    id: 'f1',
    field,
    operator,
    value,
  });

  it('sem filtro nenhum, tudo passa — é a lista inteira', () => {
    expect(matchesFilters({}, cardParado)).toBe(true);
  });

  it('um filtro que casa deixa passar', () => {
    const config = { filters: [filtro('oportunidade.etapa', 'equals', 'Primeiro contato')] };
    expect(matchesFilters(config, cardParado)).toBe(true);
  });

  it('um filtro que não casa barra', () => {
    const config = { filters: [filtro('oportunidade.etapa', 'equals', 'Ganha')] };
    expect(matchesFilters(config, cardParado)).toBe(false);
  });

  /** E, nunca OU: filtro que às vezes é "ou" é impossível de ler no quadro meses depois. */
  it('dois filtros precisam casar os dois', () => {
    const passa = {
      filters: [
        filtro('oportunidade.paradaHaMin', 'greater_than', '30'),
        filtro('oportunidade.etapa', 'equals', 'Primeiro contato'),
      ],
    };
    const barra = {
      filters: [
        filtro('oportunidade.paradaHaMin', 'greater_than', '30'),
        filtro('oportunidade.etapa', 'equals', 'Ganha'),
      ],
    };

    expect(matchesFilters(passa, cardParado)).toBe(true);
    expect(matchesFilters(barra, cardParado)).toBe(false);
  });

  it('filtro sem campo escolhido é ignorado, e não barra tudo', () => {
    expect(matchesFilters({ filters: [filtro('', 'equals', 'x')] }, cardParado)).toBe(true);
  });

  it('lista torta vira lista vazia', () => {
    expect(searchFilters({ filters: 'nada disso' })).toEqual([]);
    expect(searchFilters({ filters: [{ field: 'sem id' }] })).toEqual([]);
  });
});

/**
 * AU-19 — o valor do filtro aceita variável.
 *
 * É a peça que faltava para perguntar "existe cartão **deste** contato?": sem ela, o filtro só
 * compara com texto fixo, e uma automação que reage a uma mensagem não tem como procurar pelo
 * telefone de quem escreveu.
 *
 * A esquerda é o item da lista; a direita é o contexto da execução. Dois contextos diferentes,
 * de propósito — misturá-los faria o filtro comparar o item consigo mesmo.
 */
describe('AU-19: variável no valor do filtro', () => {
  const cartao = { contato: { telefone: '5548999998877' }, oportunidade: { etapa: 'Novo' } };
  const daExecucao = { contato: { telefone: '5548999998877', nome: 'Ana' } };

  const filtro = (value: string) => ({
    filters: [{ id: 'f1', field: 'contato.telefone', operator: 'equals', value }],
  });

  it('a variável é trocada pelo valor do contexto da execução', () => {
    expect(matchesFilters(filtro('{{contato.telefone}}'), cartao, daExecucao)).toBe(true);
  });

  it('variável que não casa barra o item', () => {
    const outro = { contato: { telefone: '5511888887777' } };
    expect(matchesFilters(filtro('{{contato.telefone}}'), outro, daExecucao)).toBe(false);
  });

  /** AU-09: variável ausente vira vazio, e o filtro compara com vazio em vez de com o marcador. */
  it('variável ausente vira vazio', () => {
    expect(matchesFilters(filtro('{{contato.email}}'), cartao, daExecucao)).toBe(false);
  });

  it('sem contexto de execução, o valor vale como texto', () => {
    expect(matchesFilters(filtro('5548999998877'), cartao, {})).toBe(true);
  });
});

/**
 * AU-20 — a busca passa a ter modo, e a lista ganha nome.
 *
 * "O primeiro que" põe os campos do item direto no contexto; "todos os que" guarda a lista
 * inteira sob um nome, e é o bloco "para cada" que a percorre depois. Separar as duas coisas —
 * buscar e iterar — é o que permite olhar o resultado antes de agir sobre ele.
 */
describe('AU-20: o modo da busca', () => {
  it('o padrão é o primeiro, que é a pergunta mais comum', () => {
    expect(searchMode({})).toBe('first');
    expect(searchMode({ mode: 'coisa nenhuma' })).toBe('first');
  });

  it('todos é o modo que guarda a lista', () => {
    expect(searchMode({ mode: 'all' })).toBe('all');
  });

  it('a lista tem nome, e o padrão é resultado', () => {
    expect(listName({})).toBe('resultado');
    expect(listName({ as: ' cartoes ' })).toBe('cartoes');
  });
});

describe('AU-20: a lista guardada no contexto', () => {
  const contexto = {
    resultado: [
      { chave: 'op-1', dados: { oportunidade: { id: 'op-1' } } },
      { chave: 'op-2', dados: { oportunidade: { id: 'op-2' } } },
    ],
  };

  it('lê a lista pelo nome', () => {
    expect(listItems(contexto, 'resultado')).toHaveLength(2);
    expect(listItems(contexto, 'resultado')[0]?.chave).toBe('op-1');
  });

  it('nome que não existe é lista vazia — o fluxo segue sem semear nada', () => {
    expect(listItems(contexto, 'outra')).toEqual([]);
  });

  /** O que veio do `jsonb` pode ser qualquer coisa: item torto é descartado, não quebra. */
  it('item sem chave ou sem dados é descartado', () => {
    const torto = { resultado: [{ chave: 'ok', dados: {} }, { chave: '' }, 'nada disso'] };
    expect(listItems(torto, 'resultado')).toHaveLength(1);
  });
});

describe('AU-20: clientes entram no catálogo', () => {
  it('a lista de clientes tem nome e campos', () => {
    const caminhos = CATALOGO_DE_BUSCA.customers.fields.map((campo) => campo.path);

    expect(CATALOGO_DE_BUSCA.customers.label).toContain('Cliente');
    expect(caminhos).toContain('cliente.nome');
    expect(caminhos).toContain('cliente.telefone');
    expect(caminhos).toContain('cliente.ehResponsavel');
  });

  /** CPF é dado sensível: não entra no contexto de automação, de onde iria parar num texto. */
  it('o CPF não é oferecido', () => {
    const caminhos = CATALOGO_DE_BUSCA.customers.fields.map((campo) => campo.path);
    expect(caminhos.some((caminho) => caminho.includes('cpf'))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  CATALOGO_DE_BUSCA,
  entityFieldsOf,
  matchesFilters,
  searchEntityOf,
  searchFilters,
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

import { describe, expect, it } from 'vitest';
import { buildConvoyList, type ConvoyEntry } from './convoyList.js';

/**
 * GR-17 — a lista do comboio. Uma linha por carro, na ordem em que o comboio se forma:
 * o condutor da empresa à frente, os clientes atrás.
 */

function entry(overrides: Partial<ConvoyEntry> = {}): ConvoyEntry {
  return {
    driver: 'Ana Lima',
    brand: 'Jeep',
    model: 'Wrangler',
    plate: 'ABC1D23',
    ...overrides,
  };
}

describe('GR-17: a ordem e a numeração do comboio', () => {
  it('o condutor da empresa vai na frente, e a numeração é 1..N', () => {
    const rows = buildConvoyList({
      lead: entry({ driver: 'Heitor', brand: 'Ford', model: 'Ranger', plate: 'SFG1H00' }),
      entries: [entry({ driver: 'Ana Lima' }), entry({ driver: 'Beto Souza', plate: 'XYZ9876' })],
    });

    expect(rows.map((row) => [row.position, row.driver])).toEqual([
      [1, 'Heitor'],
      [2, 'Ana Lima'],
      [3, 'Beto Souza'],
    ]);
  });

  it('sem condutor declarado, o primeiro cliente abre a lista', () => {
    const rows = buildConvoyList({ lead: null, entries: [entry()] });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.position).toBe(1);
  });

  it('a placa sai pontuada, como se lê no carro', () => {
    const rows = buildConvoyList({
      lead: null,
      entries: [entry({ plate: 'ABC1D23' }), entry({ plate: 'ABC1234' })],
    });

    expect(rows.map((row) => row.plate)).toEqual(['ABC1D23', 'ABC-1234']);
  });

  it('placa fora do padrão sai como está, sem derrubar a lista', () => {
    // Cadastro antigo pode ter placa que a validação de hoje recusaria; o comboio sai
    // do mesmo jeito, mostrando o que está guardado.
    const rows = buildConvoyList({ lead: null, entries: [entry({ plate: 'XX' })] });

    expect(rows[0]?.plate).toBe('XX');
  });

  it('carro não cadastrado deixa as colunas vazias, mas a linha existe', () => {
    // O documento denuncia quem falta cadastrar; sumir com a linha esconderia um carro
    // do comboio, que é justamente o que a lista serve para evitar.
    const rows = buildConvoyList({
      lead: null,
      entries: [entry({ brand: null, model: null, plate: null })],
    });

    expect(rows[0]).toMatchObject({ driver: 'Ana Lima', brand: '—', model: '—', plate: '—' });
  });

  it('comboio vazio devolve nenhuma linha', () => {
    expect(buildConvoyList({ lead: null, entries: [] })).toEqual([]);
  });
});

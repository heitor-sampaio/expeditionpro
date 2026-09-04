import { describe, expect, it } from 'vitest';
import { porBloco, type PassoEnsaiado } from './simulacao.js';

function passo(nodeId: string, outcome: string): PassoEnsaiado {
  return {
    nodeId,
    kind: 'action',
    type: 'send_message',
    outcome,
    detail: {},
    input: {},
    output: {},
  };
}

describe('AU-27: os passos do ensaio indexados por bloco', () => {
  it('acha o passo de cada bloco', () => {
    const mapa = porBloco([passo('a1', 'faria'), passo('a2', 'faria')]);
    expect(mapa.get('a2')?.outcome).toBe('faria');
  });

  it('bloco que o ensaio não alcançou não tem passo — é o ramo que não foi tomado', () => {
    expect(porBloco([passo('a1', 'faria')]).has('a2')).toBe(false);
  });

  it('bloco visitado duas vezes fica com a primeira passagem', () => {
    const mapa = porBloco([passo('a1', 'primeira'), passo('a1', 'segunda')]);
    expect(mapa.get('a1')?.outcome).toBe('primeira');
  });
});

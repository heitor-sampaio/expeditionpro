import { describe, expect, it } from 'vitest';
import { resolveTermVariables } from './termVariables.js';
import { parseCpf } from '../identity/cpf.js';
import { parseLocalDate } from '../date/localDate.js';
import { cents } from '../money/cents.js';

/**
 * DOC-08 — snapshot dos valores do Termo no aceite (para reconstruir o contrato exato
 * sob demanda, sem PDF por cliente). Função pura: dados → mapa de variáveis formatadas.
 */

const base = {
  customerName: 'Ana Prado',
  customerCpf: parseCpf('153.509.460-56'),
  itineraryName: 'Coxilha Rica',
  startDate: parseLocalDate('2025-11-10'),
  endDate: parseLocalDate('2025-11-14'),
  participantNames: ['Ana Prado', 'João Prado'],
  totalCents: cents(200000),
  companyName: 'Drakkar Expedições',
  companyCnpj: '12.345.678/0001-90',
};

describe('DOC-08: resolução das variáveis do Termo', () => {
  it('formata os valores como num contrato (CPF cheio, data BR, moeda)', () => {
    const vars = resolveTermVariables(base);
    expect(vars).toMatchObject({
      cliente_nome: 'Ana Prado',
      cliente_cpf: '153.509.460-56',
      roteiro: 'Coxilha Rica',
      data_inicio: '10/11/2025',
      data_fim: '14/11/2025',
      participantes: 'Ana Prado, João Prado',
      valor_total: 'R$ 2.000,00',
      empresa_nome: 'Drakkar Expedições',
      empresa_cnpj: '12.345.678/0001-90',
    });
  });

  it('CPF cheio (não mascarado) — é contrato', () => {
    const vars = resolveTermVariables(base);
    expect(vars.cliente_cpf).not.toContain('*');
  });

  it('campos ausentes viram string vazia, nunca "undefined" ou literal', () => {
    const vars = resolveTermVariables({
      ...base,
      itineraryName: null,
      startDate: null,
      endDate: null,
      companyCnpj: null,
    });
    expect(vars.roteiro).toBe('');
    expect(vars.data_inicio).toBe('');
    expect(vars.empresa_cnpj).toBe('');
  });
});

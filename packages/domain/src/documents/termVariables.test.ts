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

describe('SEC-01 · DOC-09: valor de variável nunca vira markup no contrato', () => {
  /*
   * O buraco: `renderMarkdownToSafeHtml` escapa o texto do admin **antes** de introduzir
   * tags, e preserva os marcadores `{{...}}` de propósito atravessando esse escape. Depois,
   * `renderTermTemplate` injetava o valor da variável **no HTML já sanitizado** — ou seja,
   * depois do escape, dentro de markup, e daí para `dangerouslySetInnerHTML`.
   *
   * A origem do valor é entrada não confiável: `cliente_nome` vem do webhook público de
   * inscrição, cuja validação é `String(raw).trim()` — sem restrição de caractere. Um nome
   * com `<img onerror=...>` executava quando a equipe abria "ver termo aceito" ou o cliente
   * abria o contrato no portal.
   *
   * O PRD (§1144) já dizia que "só o admin escreve" não é defesa. A defesa foi construída
   * para o texto do admin e furada pelo dado do cliente. A mesma regra já era aplicada
   * corretamente no e-mail (`resendNotificationGateway`), só não aqui.
   */
  const perigoso = '<img src=x onerror=alert(1)>';

  it('escapa o nome do cliente, que vem do formulário público', () => {
    const vars = resolveTermVariables({
      customerName: perigoso,
      customerCpf: parseCpf('900.000.100-57'),
      itineraryName: null,
      startDate: null,
      endDate: null,
      participantNames: [],
      totalCents: cents(0),
      companyName: null,
      companyCnpj: null,
    });

    expect(vars['cliente_nome']).not.toContain('<img');
    expect(vars['cliente_nome']).toContain('&lt;img');
  });

  it('escapa também roteiro, participantes e nome da empresa', () => {
    const vars = resolveTermVariables({
      customerName: 'Ana',
      customerCpf: parseCpf('900.000.100-57'),
      itineraryName: perigoso,
      startDate: null,
      endDate: null,
      participantNames: [perigoso, 'Rui'],
      totalCents: cents(0),
      companyName: perigoso,
      companyCnpj: null,
    });

    for (const chave of ['roteiro', 'participantes', 'empresa_nome']) {
      expect(vars[chave]).not.toContain('<img');
      expect(vars[chave]).toContain('&lt;img');
    }
  });

  it('aspas também — senão o valor quebra o atributo de um link do template', () => {
    const vars = resolveTermVariables({
      customerName: 'Ana " onmouseover="alert(1)',
      customerCpf: parseCpf('900.000.100-57'),
      itineraryName: null,
      startDate: null,
      endDate: null,
      participantNames: [],
      totalCents: cents(0),
      companyName: null,
      companyCnpj: null,
    });

    expect(vars['cliente_nome']).not.toContain('"');
    expect(vars['cliente_nome']).toContain('&quot;');
  });

  it('texto comum passa legível — escapar não pode estragar o contrato', () => {
    const vars = resolveTermVariables({
      customerName: 'Ana Gonçalves de Sá',
      customerCpf: parseCpf('900.000.100-57'),
      itineraryName: 'Coxilha Rica',
      startDate: null,
      endDate: null,
      participantNames: ['Rui Alves'],
      totalCents: cents(120000),
      companyName: 'Drakkar Expedições',
      companyCnpj: null,
    });

    expect(vars['cliente_nome']).toBe('Ana Gonçalves de Sá');
    expect(vars['roteiro']).toBe('Coxilha Rica');
    expect(vars['participantes']).toBe('Rui Alves');
  });
});

import { describe, expect, it } from 'vitest';
import { resolveAcceptanceRequirement, renderTermTemplate } from './termAcceptance.js';

/**
 * §5.13 · DOC-03/DOC-04/DOC-07 — coração puro dos documentos. A regra de (re)aceite é a
 * prova de consentimento; a renderização substitui as variáveis do termo pelos dados reais.
 */

const v3 = { id: 'ver-3', versionNumber: 3, requiresReacceptance: false } as const;
const v3r = { id: 'ver-3', versionNumber: 3, requiresReacceptance: true } as const;

describe('DOC-04: cliente novo precisa aceitar a versão vigente', () => {
  it('sem nenhum aceite, exige aceitar a versão vigente', () => {
    const req = resolveAcceptanceRequirement({ current: v3, acceptedVersionNumbers: [] });
    expect(req).toEqual({ mustAccept: true, versionId: 'ver-3', versionNumber: 3 });
  });

  it('quem já aceitou a versão vigente não vê a tela de novo', () => {
    const req = resolveAcceptanceRequirement({ current: v3, acceptedVersionNumbers: [3] });
    expect(req.mustAccept).toBe(false);
  });
});

describe('DOC-03: reaceite conforme a marcação da publicação', () => {
  it('versão que NÃO exige reaceite: quem aceitou uma anterior segue coberto', () => {
    const req = resolveAcceptanceRequirement({ current: v3, acceptedVersionNumbers: [1] });
    expect(req.mustAccept).toBe(false);
  });

  it('versão que EXIGE reaceite: quem só aceitou anterior precisa aceitar de novo', () => {
    const req = resolveAcceptanceRequirement({ current: v3r, acceptedVersionNumbers: [1, 2] });
    expect(req).toEqual({ mustAccept: true, versionId: 'ver-3', versionNumber: 3 });
  });

  it('versão que exige reaceite, mas o cliente já aceitou justamente ela: coberto', () => {
    const req = resolveAcceptanceRequirement({ current: v3r, acceptedVersionNumbers: [1, 3] });
    expect(req.mustAccept).toBe(false);
  });
});

describe('sem termo publicado não há o que aceitar', () => {
  it('current null → não exige aceite', () => {
    const req = resolveAcceptanceRequirement({ current: null, acceptedVersionNumbers: [] });
    expect(req.mustAccept).toBe(false);
  });
});

describe('DOC-07: substituição de variáveis do termo', () => {
  it('substitui os marcadores conhecidos pelos dados reais', () => {
    const out = renderTermTemplate(
      'Olá {{cliente_nome}}, roteiro {{roteiro}} por {{valor_total}}.',
      {
        cliente_nome: 'Ana Prado',
        roteiro: 'Coxilha Rica',
        valor_total: 'R$ 2.000,00',
      },
    );
    expect(out).toBe('Olá Ana Prado, roteiro Coxilha Rica por R$ 2.000,00.');
  });

  it('marcador sem valor fornecido permanece literal (não vira "undefined")', () => {
    const out = renderTermTemplate('CPF {{cliente_cpf}} / {{desconhecido}}', {
      cliente_cpf: '123.***.***-00',
    });
    expect(out).toBe('CPF 123.***.***-00 / {{desconhecido}}');
  });

  it('o mesmo marcador repetido é todo substituído', () => {
    const out = renderTermTemplate('{{empresa_nome}} — {{empresa_nome}}', {
      empresa_nome: 'Drakkar',
    });
    expect(out).toBe('Drakkar — Drakkar');
  });
});

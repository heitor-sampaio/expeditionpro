import { describe, expect, it } from 'vitest';
import {
  documentErrorFor,
  fileNameFromDisposition,
  resolveGroupDocumentAction,
} from './groupDocumentAction.js';

/**
 * GR-15/GR-16 — a régua dos botões de documento na mesa (roomlist e seguro). O servidor
 * decide de verdade; a tela desabilita o que já se sabe que vai falhar e diz por quê.
 */

describe('GR-15/GR-16: quando dá para gerar documento da saída', () => {
  it('owner e admin geram quando há inscrição confirmada', () => {
    for (const role of ['owner', 'admin']) {
      expect(resolveGroupDocumentAction({ confirmedCount: 2, role })).toEqual({
        enabled: true,
        reason: null,
      });
    }
  });

  it('sem inscrição confirmada, desabilita com o motivo', () => {
    const action = resolveGroupDocumentAction({ confirmedCount: 0, role: 'owner' });

    expect(action.enabled).toBe(false);
    expect(action.reason).toBe('Nenhuma inscrição confirmada nesta saída.');
  });

  it('papel sem permissão vê o botão desabilitado, não escondido', () => {
    for (const role of ['operator', 'viewer', null]) {
      const action = resolveGroupDocumentAction({ confirmedCount: 3, role });

      expect(action.enabled).toBe(false);
      expect(action.reason).toBe('Gerar documentos da saída exige owner ou admin.');
    }
  });

  it('a falta de permissão é dita antes da falta de confirmada', () => {
    expect(resolveGroupDocumentAction({ confirmedCount: 0, role: 'operator' }).reason).toBe(
      'Gerar documentos da saída exige owner ou admin.',
    );
  });
});

describe('GR-15/GR-16: o erro que a tela mostra', () => {
  it('traduz os códigos do servidor', () => {
    expect(documentErrorFor('forbidden')).toBe('Gerar documentos da saída exige owner ou admin.');
    expect(documentErrorFor('not_found')).toBe('Esta saída não existe mais.');
    expect(documentErrorFor('qualquer-outro')).toBe(
      'Não foi possível gerar o documento. Tente de novo.',
    );
  });
});

describe('GR-15/GR-16: o nome do arquivo vem do servidor', () => {
  it('lê o filename do Content-Disposition', () => {
    expect(
      fileNameFromDisposition('attachment; filename="roomlist-coxilha-rica-2026-11-10.pdf"', 'x'),
    ).toBe('roomlist-coxilha-rica-2026-11-10.pdf');
    expect(
      fileNameFromDisposition('attachment; filename="seguro-coxilha-2026-11-10.xlsx"', 'x'),
    ).toBe('seguro-coxilha-2026-11-10.xlsx');
  });

  it('sem cabeçalho, usa o nome padrão de quem chamou', () => {
    expect(fileNameFromDisposition(null, 'roomlist.pdf')).toBe('roomlist.pdf');
    expect(fileNameFromDisposition('attachment', 'seguro.xlsx')).toBe('seguro.xlsx');
  });
});

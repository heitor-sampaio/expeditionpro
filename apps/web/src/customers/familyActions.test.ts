import { describe, it, expect } from 'vitest';
import { resolveFamilyActions, familyErrorFor } from './familyActions.js';

/**
 * As guardas de vínculo vivem no servidor (CL-07/CL-10); aqui só decidimos o que a
 * ficha oferece e o que ela desabilita com o motivo à vista — o design system manda
 * manter a ação visível e desabilitada, porque esconder a ação esconde o sistema.
 */
describe('CL-10: ações de vínculo disponíveis na ficha', () => {
  it('responsável sem acompanhantes pode ser vinculado a outra família', () => {
    const move = actionOf('move', { role: 'responsible', companionCount: 0 });
    expect(move.enabled).toBe(true);
    expect(move.reason).toBeNull();
  });

  it('responsável com acompanhantes não pode virar acompanhante — o motivo fica à vista', () => {
    const move = actionOf('move', { role: 'responsible', companionCount: 2 });
    expect(move.enabled).toBe(false);
    expect(move.reason).toBe('Realoque ou promova os acompanhantes antes de vincular.');
  });

  it('acompanhante pode virar responsável; responsável já é', () => {
    expect(actionOf('promote', { role: 'companion', companionCount: 0 }).enabled).toBe(true);
    const already = actionOf('promote', { role: 'responsible', companionCount: 0 });
    expect(already.enabled).toBe(false);
    expect(already.reason).toBe('Já é responsável da própria família.');
  });

  it('CL-07: mesclar duplicado está sempre disponível', () => {
    expect(actionOf('merge', { role: 'companion', companionCount: 0 }).enabled).toBe(true);
    expect(actionOf('merge', { role: 'responsible', companionCount: 3 }).enabled).toBe(true);
  });

  it('as três ações são oferecidas, sempre na mesma ordem', () => {
    expect(resolveFamilyActions({ role: 'companion', companionCount: 1 }).map((a) => a.id)).toEqual(
      ['move', 'promote', 'merge'],
    );
  });
});

describe('CL-07/CL-10: erro do servidor vira uma frase', () => {
  it.each([
    ['self_link', 'Um cliente não pode ser vinculado a si mesmo.'],
    ['not_a_responsible', 'O destino precisa ser um responsável de família.'],
    ['has_dependents', 'Realoque ou promova os acompanhantes antes de vincular.'],
    ['not_same_family', 'Só dá para levar acompanhantes da família de origem.'],
    ['merge_self', 'Escolha outro cadastro: não dá para mesclar um cliente com ele mesmo.'],
    [
      'survivor_not_responsible',
      'Para herdar os acompanhantes, o cadastro mantido precisa ser responsável.',
    ],
  ])('%s', (code, message) => {
    expect(familyErrorFor(code)).toBe(message);
  });

  it('código desconhecido cai numa frase acionável', () => {
    expect(familyErrorFor('boom')).toBe('Não foi possível concluir. Tente de novo.');
  });
});

function actionOf(
  id: 'move' | 'promote' | 'merge',
  input: { role: 'responsible' | 'companion'; companionCount: number },
) {
  const action = resolveFamilyActions(input).find((a) => a.id === id);
  if (!action) throw new Error(`ação ${id} não oferecida`);
  return action;
}

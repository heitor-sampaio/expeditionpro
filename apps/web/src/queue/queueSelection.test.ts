import { describe, expect, it } from 'vitest';
import { initialGroupId } from './queueSelection.js';

/**
 * §5.8 — o pedido do app guarda a saída que o cliente escolheu, mas ela pode ter sido
 * excluída antes de a equipe revisar. Pré-selecionar um grupo que não existe mais deixa
 * o botão de alocar habilitado apontando para o vazio: o clique só falha no servidor.
 */
const GRUPOS = [
  { id: 'g1', name: 'Coxilha Rica · 10/11', startDate: '2026-11-10' },
  { id: 'g2', name: 'Vale Europeu · 03/12', startDate: '2026-12-03' },
];

describe('§5.8: a saída pré-selecionada é a escolhida pelo cliente, se ainda existir', () => {
  it('pré-seleciona a saída escolhida no app', () => {
    expect(initialGroupId('g2', GRUPOS)).toBe('g2');
  });

  it('não pré-seleciona saída que saiu da agenda — a equipe escolhe de novo', () => {
    expect(initialGroupId('g9', GRUPOS)).toBe('');
  });

  it('pedido do formulário do site começa sem saída', () => {
    expect(initialGroupId(null, GRUPOS)).toBe('');
  });
});

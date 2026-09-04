import { describe, expect, it } from 'vitest';
import { actionResultName } from './actionResult.js';

describe('AU-23: onde a resposta de uma ação é guardada', () => {
  it('devolve o nome quando a ação pede para guardar', () => {
    expect(actionResultName({ saveAs: 'resposta' })).toBe('resposta');
  });

  it('apara o espaço em volta — quem digita deixa, e o nome não pode carregar isso', () => {
    expect(actionResultName({ saveAs: '  resposta  ' })).toBe('resposta');
  });

  it('devolve nulo quando a ação não pede nada, que é o caso da maioria', () => {
    expect(actionResultName({})).toBeNull();
    expect(actionResultName({ saveAs: '' })).toBeNull();
    expect(actionResultName({ saveAs: '   ' })).toBeNull();
  });

  it('recusa nome que o marcador de texto não alcançaria', () => {
    // `{{minha resposta.x}}` não existe: guardar sob esse nome seria dado inacessível.
    expect(actionResultName({ saveAs: 'minha resposta' })).toBeNull();
    expect(actionResultName({ saveAs: 'resposta.corpo' })).toBeNull();
    expect(actionResultName({ saveAs: '2resposta' })).toBeNull();
    expect(actionResultName({ saveAs: 'resposta-http' })).toBeNull();
  });

  it('aceita o que é identificador de verdade', () => {
    expect(actionResultName({ saveAs: 'resposta_http' })).toBe('resposta_http');
    expect(actionResultName({ saveAs: '_x9' })).toBe('_x9');
  });

  it('ignora o que não é texto — config vem de JSON salvo, e JSON aceita qualquer coisa', () => {
    expect(actionResultName({ saveAs: 42 })).toBeNull();
    expect(actionResultName({ saveAs: null })).toBeNull();
    expect(actionResultName({ saveAs: ['resposta'] })).toBeNull();
  });
});

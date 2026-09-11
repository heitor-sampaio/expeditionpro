import { describe, expect, it } from 'vitest';
import { itinerarySlug } from './itinerarySlug.js';

describe('RO-02: o slug do roteiro', () => {
  it('reduz o nome ao endereco que cabe numa URL', () => {
    expect(itinerarySlug('Coxilha Rica')).toBe('coxilha-rica');
    expect(itinerarySlug('Urubici 360')).toBe('urubici-360');
  });

  it('tira o acento em vez de descartar a letra', () => {
    expect(itinerarySlug('Serra Gaúcha')).toBe('serra-gaucha');
    expect(itinerarySlug('Pirâmides Sagradas')).toBe('piramides-sagradas');
    expect(itinerarySlug('Ametista e Missões')).toBe('ametista-e-missoes');
  });

  it('colapsa pontuacao e espaco num hifen so, sem sobrar nas pontas', () => {
    expect(itinerarySlug('Coxilha Rica • O caminho dos tropeiros')).toBe(
      'coxilha-rica-o-caminho-dos-tropeiros',
    );
    expect(itinerarySlug('  --Vale   Europeu--  ')).toBe('vale-europeu');
  });

  it('ignora a caixa, porque CMS e encurtador mexem nela', () => {
    expect(itinerarySlug('COXILHA-RICA')).toBe('coxilha-rica');
  });

  it('devolve null quando nao sobra nada — o campo e um endereco, nao pode ser vazio', () => {
    expect(itinerarySlug('')).toBeNull();
    expect(itinerarySlug('   ')).toBeNull();
    expect(itinerarySlug('•••')).toBeNull();
    expect(itinerarySlug('---')).toBeNull();
  });

  it('e idempotente: passar um slug ja pronto devolve ele mesmo', () => {
    for (const nome of ['Coxilha Rica • O caminho dos tropeiros', 'Serra Gaúcha', 'Urubici 360']) {
      const uma = itinerarySlug(nome);
      expect(itinerarySlug(uma!)).toBe(uma);
    }
  });
});

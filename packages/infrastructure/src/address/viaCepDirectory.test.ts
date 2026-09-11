import { describe, expect, it } from 'vitest';
import { mapViaCepResponse } from './viaCepDirectory.js';

/**
 * CL-02 — o formato do ViaCEP fica contido aqui.
 *
 * O mapeamento é puro e testado à parte da rede porque é a única parte que pode estar errada
 * sem que nada quebre: um campo renomeado do outro lado vira endereço vazio, e endereço vazio
 * parece "CEP não encontrado".
 */
describe('CL-02: a resposta do ViaCEP', () => {
  it('vira o endereço que o port promete', () => {
    expect(
      mapViaCepResponse({
        logradouro: 'Rua Felipe Schmidt',
        bairro: 'Centro',
        localidade: 'Florianópolis',
        uf: 'SC',
      }),
    ).toEqual({
      street: 'Rua Felipe Schmidt',
      district: 'Centro',
      city: 'Florianópolis',
      state: 'SC',
    });
  });

  /** O ViaCEP responde 200 com `erro: true` para CEP inexistente — não 404. */
  it('CEP inexistente responde 200 com erro, e vira null', () => {
    expect(mapViaCepResponse({ erro: true })).toBeNull();
    expect(mapViaCepResponse({ erro: 'true' })).toBeNull();
  });

  /**
   * CEP de cidade inteira (os terminados em -000 de municípios pequenos) vem sem logradouro
   * nem bairro. É resposta válida: a cidade e a UF já poupam dois campos.
   */
  it('campo ausente vira string vazia, não quebra', () => {
    expect(mapViaCepResponse({ localidade: 'Urubici', uf: 'SC' })).toEqual({
      street: '',
      district: '',
      city: 'Urubici',
      state: 'SC',
    });
  });

  it('corpo que não é objeto vira null', () => {
    expect(mapViaCepResponse(null)).toBeNull();
    expect(mapViaCepResponse('erro')).toBeNull();
  });

  /** Sem cidade não sobra nada de útil — preencher UF sozinha não ajuda quem digitou. */
  it('resposta sem cidade vira null', () => {
    expect(mapViaCepResponse({ uf: 'SC' })).toBeNull();
  });
});

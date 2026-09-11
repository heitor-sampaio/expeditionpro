import { describe, expect, it } from 'vitest';
import { lookupCep } from './lookupCep.js';
import type { CepAddress, CepDirectory } from './cepDirectory.js';

const SANTA_CATARINA: CepAddress = {
  street: 'Rua Felipe Schmidt',
  district: 'Centro',
  city: 'Florianópolis',
  state: 'SC',
};

function diretorio(resposta: CepAddress | null): CepDirectory & { pedidos: string[] } {
  const pedidos: string[] = [];
  return {
    pedidos,
    lookup(cep: string) {
      pedidos.push(cep);
      return Promise.resolve(resposta);
    },
  };
}

describe('CL-02: consulta de CEP', () => {
  it('devolve o endereço do CEP, pedindo ao diretório só os dígitos', async () => {
    const ceps = diretorio(SANTA_CATARINA);

    const achado = await lookupCep({ ceps }, { cep: '88.010-000' });

    expect(achado).toEqual(SANTA_CATARINA);
    expect(ceps.pedidos).toEqual(['88010000']);
  });

  /**
   * A recusa de formato acontece **antes** da rede: oito dígitos é tudo o que se sabe sobre um
   * CEP sem perguntar, e perguntar por "abc" é gastar uma chamada externa para ouvir não.
   */
  it('CEP malformado não chega a virar chamada externa', async () => {
    const ceps = diretorio(SANTA_CATARINA);

    await expect(lookupCep({ ceps }, { cep: '123' })).rejects.toMatchObject({
      code: 'invalid_cep',
    });
    expect(ceps.pedidos).toEqual([]);
  });

  it('CEP bem formado que não existe devolve null, e não erro', async () => {
    const ceps = diretorio(null);

    expect(await lookupCep({ ceps }, { cep: '99999999' })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { describeVehicle } from './describeVehicle.js';

/**
 * CL-05 — o carro em uma linha só, para a mesa do grupo. Marca e modelo podem vir do
 * catálogo ou do texto livre "Outro" (§3.3): quem lê a lista de embarque não quer saber
 * de qual dos dois veio.
 */
describe('CL-05: como o carro aparece em uma linha', () => {
  it('marca e modelo do catálogo', () => {
    expect(
      describeVehicle({
        brandName: 'Jeep',
        modelName: 'Renegade',
        brandOther: null,
        modelOther: null,
      }),
    ).toBe('Jeep Renegade');
  });

  it('texto livre entra no lugar do que falta no catálogo', () => {
    expect(
      describeVehicle({
        brandName: null,
        modelName: null,
        brandOther: 'Troller',
        modelOther: 'T4',
      }),
    ).toBe('Troller T4');
    expect(
      describeVehicle({
        brandName: 'Jeep',
        modelName: null,
        brandOther: null,
        modelOther: 'Willys 1965',
      }),
    ).toBe('Jeep Willys 1965');
  });

  it('só a marca já descreve; nada preenchido vira null, não string vazia', () => {
    expect(
      describeVehicle({ brandName: 'Jeep', modelName: null, brandOther: null, modelOther: null }),
    ).toBe('Jeep');
    expect(
      describeVehicle({ brandName: null, modelName: null, brandOther: '  ', modelOther: null }),
    ).toBeNull();
  });
});

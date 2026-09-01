import { describe, expect, it } from 'vitest';
import { parseCpf } from '../identity/cpf.js';
import { parseLocalDate } from '../date/localDate.js';
import {
  buildRoomlist,
  formatRoomlistAddress,
  type RoomlistAddress,
  type RoomlistParty,
} from './roomlist.js';

/**
 * GR-15 — o documento que vai para o hotel. Núcleo puro: quem entra, em que ordem, e
 * como cada dado aparece no papel. Sem I/O, sem data corrente, sem saber o que é PDF.
 */

const EMPTY: RoomlistAddress = {
  street: null,
  number: null,
  district: null,
  city: null,
  state: null,
  zip: null,
};

const FULL_ADDRESS: RoomlistAddress = {
  street: 'Rua Luiz Pasteur',
  number: '509',
  district: 'Trindade',
  city: 'Florianópolis',
  state: 'SC',
  zip: '88036100',
};

function party(
  overrides: Partial<RoomlistParty['responsible']> = {},
  companions = [],
): RoomlistParty {
  return {
    responsible: {
      fullName: 'Maria Souza',
      cpf: parseCpf('11144477735'),
      birthDate: parseLocalDate('1990-05-20'),
      email: 'maria@example.com',
      phone: '+5548999998888',
      address: FULL_ADDRESS,
      ...overrides,
    },
    companions,
  };
}

const LEAD: RoomlistParty = {
  responsible: {
    fullName: 'Heitor de Oliveira Sampaio',
    cpf: parseCpf('90000010057'),
    birthDate: parseLocalDate('1989-01-14'),
    email: 'heitorosampaio@gmail.com',
    phone: '+5548999998877',
    address: FULL_ADDRESS,
  },
  companions: [
    { fullName: 'Vanessa Marek Campesatto', birthDate: parseLocalDate('1983-03-30') },
    { fullName: 'Enzo Sampaio', birthDate: parseLocalDate('2018-08-02') },
  ],
};

describe('GR-15: o condutor abre o documento e a numeração é contínua', () => {
  it('o condutor é sempre o registro 1, e as famílias vêm depois', () => {
    const entries = buildRoomlist({
      lead: LEAD,
      parties: [party({ fullName: 'Ana Lima', cpf: parseCpf('52998224725') }), party()],
    });

    expect(entries.map((entry) => [entry.position, entry.fullName])).toEqual([
      [1, 'Heitor de Oliveira Sampaio'],
      [2, 'Ana Lima'],
      [3, 'Maria Souza'],
    ]);
  });

  it('a ordem das famílias é a que chega — a de inscrição, não a alfabética', () => {
    const entries = buildRoomlist({
      lead: null,
      parties: [
        party({ fullName: 'Zeca Pagodinho', cpf: parseCpf('52998224725') }),
        party({ fullName: 'Ana Lima', cpf: parseCpf('39053344705') }),
      ],
    });

    expect(entries.map((entry) => entry.fullName)).toEqual(['Zeca Pagodinho', 'Ana Lima']);
  });

  it('sem condutor, a primeira família é o registro 1', () => {
    const entries = buildRoomlist({ lead: null, parties: [party()] });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.position).toBe(1);
  });

  it('grupo sem inscrição confirmada devolve só o condutor', () => {
    const entries = buildRoomlist({ lead: LEAD, parties: [] });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.fullName).toBe('Heitor de Oliveira Sampaio');
  });

  it('o condutor não aparece duas vezes quando também tem inscrição', () => {
    // Mesmo CPF do condutor entre as famílias: é a mesma pessoa, um registro só.
    const entries = buildRoomlist({
      lead: LEAD,
      parties: [party({ fullName: 'Heitor Sampaio', cpf: parseCpf('90000010057') }), party()],
    });

    expect(entries.map((entry) => entry.fullName)).toEqual([
      'Heitor de Oliveira Sampaio',
      'Maria Souza',
    ]);
  });
});

describe('GR-15: cada dado aparece como o hotel lê', () => {
  it('CPF pontuado, nascimento em DD/MM/AAAA e telefone formatado', () => {
    const entry = buildRoomlist({ lead: LEAD, parties: [] })[0]!;

    expect(entry.cpf).toBe('900.000.100-57');
    expect(entry.birthDate).toBe('14/01/1989');
    expect(entry.phone).toBe('+55 (48)99999-8877');
    expect(entry.email).toBe('heitorosampaio@gmail.com');
  });

  it('contato ausente vira travessão, nunca string vazia nem "null"', () => {
    const entry = buildRoomlist({
      lead: null,
      parties: [party({ email: null, phone: null })],
    })[0]!;

    expect(entry.email).toBe('—');
    expect(entry.phone).toBe('—');
  });

  it('o endereço sai numa linha só, com CEP pontuado', () => {
    expect(formatRoomlistAddress(FULL_ADDRESS)).toBe(
      'Rua Luiz Pasteur, 509 — Trindade — Florianópolis/SC — CEP 88036-100',
    );
  });

  it('endereço incompleto não deixa separador órfão', () => {
    expect(formatRoomlistAddress({ ...EMPTY, street: 'Rua das Flores', city: 'Lages' })).toBe(
      'Rua das Flores — Lages',
    );
    expect(formatRoomlistAddress({ ...EMPTY, city: 'Lages', state: 'SC' })).toBe('Lages/SC');
    expect(formatRoomlistAddress(EMPTY)).toBe('—');
  });
});

describe('GR-15: acompanhante vai com o mínimo', () => {
  it('sai nome e nascimento, e nada além disso', () => {
    const entry = buildRoomlist({ lead: LEAD, parties: [] })[0]!;

    expect(entry.companions).toEqual([
      { fullName: 'Vanessa Marek Campesatto', birthDate: '30/03/1983' },
      { fullName: 'Enzo Sampaio', birthDate: '02/08/2018' },
    ]);
    // O tipo já garante, mas o documento vai para fora da empresa: o teste também.
    expect(Object.keys(entry.companions[0]!)).toEqual(['fullName', 'birthDate']);
  });

  it('inscrição sem acompanhante fica com a lista vazia', () => {
    const entry = buildRoomlist({ lead: null, parties: [party()] })[0]!;

    expect(entry.companions).toEqual([]);
  });
});

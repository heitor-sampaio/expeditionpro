import { describe, expect, it } from 'vitest';
import { parseCpf } from '../identity/cpf.js';
import { parseLocalDate } from '../date/localDate.js';
import { buildInsuranceList, formatInsurancePhone, type InsurancePerson } from './insuranceList.js';

/**
 * GR-16 — a lista que vai para a seguradora. Ao contrário da roomlist, aqui **cada
 * pessoa é uma linha**: o seguro cobre indivíduos, não famílias.
 */

function person(overrides: Partial<InsurancePerson> = {}): InsurancePerson {
  return {
    fullName: 'Ana Lima',
    cpf: parseCpf('11144477735'),
    birthDate: parseLocalDate('1990-05-20'),
    email: 'ana@example.com',
    phone: '+5548999998888',
    ...overrides,
  };
}

describe('GR-16: uma linha por pessoa', () => {
  it('mantém a ordem recebida e não agrupa por família', () => {
    const rows = buildInsuranceList([
      person({ fullName: 'Ana Lima' }),
      person({ fullName: 'Filho Lima', cpf: parseCpf('52998224725') }),
      person({ fullName: 'Beto Souza', cpf: parseCpf('39053344705') }),
    ]);

    expect(rows.map((row) => row.fullName)).toEqual(['Ana Lima', 'Filho Lima', 'Beto Souza']);
  });

  it('o CPF sai só com dígitos — a planilha tem o formato que o pontua', () => {
    const rows = buildInsuranceList([person()]);

    expect(rows[0]?.cpf).toBe('11144477735');
  });

  it('a mesma pessoa em duas inscrições entra uma vez só', () => {
    // Acompanhante que aparece em duas famílias não pode gerar dois seguros.
    const rows = buildInsuranceList([
      person({ fullName: 'Enzo', cpf: parseCpf('11144477735') }),
      person({ fullName: 'Enzo Sampaio', cpf: parseCpf('11144477735') }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.fullName).toBe('Enzo');
  });

  it('lista vazia devolve nenhuma linha', () => {
    expect(buildInsuranceList([])).toEqual([]);
  });
});

describe('GR-16: o contato como a planilha pede', () => {
  it('telefone em (DDD)número, sem DDI nem hífen', () => {
    expect(formatInsurancePhone('+5548999998877')).toBe('(48)999998877');
    expect(formatInsurancePhone('48999998877')).toBe('(48)999998877');
    expect(formatInsurancePhone('4832221100')).toBe('(48)32221100');
  });

  it('telefone ausente ou irreconhecível vira vazio, não texto inventado', () => {
    expect(formatInsurancePhone(null)).toBe('');
    expect(formatInsurancePhone('123')).toBe('');
  });

  it('e-mail ausente vira vazio — a coluna não é obrigatória', () => {
    const rows = buildInsuranceList([person({ email: null, phone: null })]);

    expect(rows[0]?.email).toBe('');
    expect(rows[0]?.phone).toBe('');
  });
});

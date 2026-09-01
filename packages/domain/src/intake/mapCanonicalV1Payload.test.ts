import { describe, expect, it } from 'vitest';
import { mapCanonicalV1Payload, readCanonicalV1Identity } from './mapCanonicalV1Payload.js';
import { IntakeValidationError } from './intakeFieldRules.js';

function payload() {
  return {
    form_id: 4641,
    entry_id: 101,
    submitted: '2026-08-11T18:57:17-03:00',
    desired_date: '2025-11-10',
    consent: true,
    responsible: {
      full_name: 'Heitor Sampaio',
      cpf: '900.000.100-57',
      birth_date: '1989-01-14',
      email: 'contato@exemplo.com',
      phone: '(48) 99999-8877',
    },
    address: {
      street: 'Rua Luiz Pasteur',
      number: '509',
      district: 'Trindade',
      city: 'Florianópolis',
      state: 'Santa Catarina',
      zip: '88036-100',
    },
    vehicle: { brand: 'Ford', model: 'Ranger', plate: 'ABC1234' },
    companions: [{ full_name: 'Fulana de Tal', cpf: '12345678909', birth_date: '2015-03-22' }],
    custom_fields: { observacao: 'chega dia 9' },
  };
}

describe('IN-01b/§5.7.1: perfil de mapeamento canonical_v1', () => {
  it('mapeia o payload aninhado para a forma interna, normalizando como o wp_flat', () => {
    const mapped = mapCanonicalV1Payload(payload());
    expect(mapped.formId).toBe('4641');
    expect(mapped.entryId).toBe('101');
    expect(mapped.responsible.fullName).toBe('Heitor Sampaio');
    expect(mapped.responsible.cpf).toBe('90000010057'); // só dígitos
    expect(mapped.responsible.phone).toBe('48999998877'); // só dígitos
    expect(mapped.responsible.birthDate).toEqual({ year: 1989, month: 1, day: 14 });
    expect(mapped.address.state).toBe('SA'); // UF de 2 letras (uppercase, corta em 2)
    expect(mapped.address.zip).toBe('88036100');
    expect(mapped.vehicle?.plate).toBe('ABC-1234'); // placa válida formatada
    expect(mapped.vehicle?.plateValid).toBe(true);
    expect(mapped.companions).toHaveLength(1);
    expect(mapped.companions[0]!.cpf).toBe('12345678909');
    expect(mapped.consent).toBe(true);
    expect(mapped.desiredDate).toEqual({ year: 2025, month: 11, day: 10 });
    expect(mapped.customFields).toEqual({ observacao: 'chega dia 9' });
  });

  it('CPF do responsável inválido → IntakeValidationError no campo (mesmo código do wp_flat)', () => {
    const bad = payload();
    bad.responsible.cpf = '90000010000';
    try {
      mapCanonicalV1Payload(bad);
      expect.fail('deveria ter lançado');
    } catch (error) {
      expect(error).toBeInstanceOf(IntakeValidationError);
      expect((error as IntakeValidationError).field).toBe('responsible.cpf');
      expect((error as IntakeValidationError).code).toBe('invalid_check_digit');
    }
  });

  it('campo obrigatório ausente no responsável bloqueia', () => {
    const bad = payload();
    bad.responsible.full_name = '';
    expect(() => mapCanonicalV1Payload(bad)).toThrow(IntakeValidationError);
  });

  it('sem veículo (objeto ausente) → vehicle null, não bloqueia', () => {
    const p = payload();
    delete (p as { vehicle?: unknown }).vehicle;
    const mapped = mapCanonicalV1Payload(p);
    expect(mapped.vehicle).toBeNull();
  });

  it('placa inválida não bloqueia: grava como veio + aviso', () => {
    const p = payload();
    p.vehicle.plate = 'XX';
    const mapped = mapCanonicalV1Payload(p);
    expect(mapped.vehicle?.plateValid).toBe(false);
    expect(mapped.vehicle?.plate).toBe('XX');
    expect(mapped.warnings.length).toBeGreaterThan(0);
  });

  it('sem acompanhantes → lista vazia', () => {
    const p = payload();
    p.companions = [];
    expect(mapCanonicalV1Payload(p).companions).toHaveLength(0);
  });

  it('readCanonicalV1Identity lê form_id/entry_id sem validar o resto', () => {
    expect(readCanonicalV1Identity({ form_id: 4641, entry_id: 7 })).toEqual({
      formId: '4641',
      entryId: '7',
    });
    expect(readCanonicalV1Identity({})).toEqual({ formId: '', entryId: '' });
  });
});

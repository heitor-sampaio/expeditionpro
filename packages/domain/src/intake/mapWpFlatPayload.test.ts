import { describe, it, expect } from 'vitest';
import { mapWpFlatPayload, IntakeValidationError } from './mapWpFlatPayload.js';
import { parseLocalDate } from '../date/localDate.js';

/**
 * Perfil wp_flat_v1 (§5.7.1) — o parser é função pura e é coração do webhook.
 * Obrigatório bloqueia (422 com o campo culpado); malformado em opcional vira aviso.
 * Lê sempre `value`, nunca `formatted`.
 */

const base = () => ({
  entry_id: 2,
  form_id: 4641,
  form_title: 'Coxilha Rica',
  submitted: '2026-08-11T18:57:17-03:00',
  fields: {
    resp_nome: { value: 'Heitor Sampaio' },
    resp_cpf: { value: '900.000.100-57' },
    resp_email: { value: 'contato@exemplo.com' },
    resp_telefone: { value: '(48) 99999-8877' },
    resp_nascimento: { value: '1989-01-14' },
    cep: { value: '88036-100' },
    endereco: { value: 'Rua Luiz Pasteur' },
    numero: { value: '509' },
    bairro: { value: 'Trindade' },
    cidade: { value: 'Florianópolis' },
    estado: { value: 'SC', formatted: 'Santa Catarina' },
    marca: { value: 'Ford' },
    modelo: { value: 'Ranger' },
    placa: { value: 'ABC1234' },
    qtd_acompanhantes: { value: '2' },
    acomp_1_nome: { value: 'Fulana de Tal' },
    acomp_1_cpf: { value: '12345678909' },
    acomp_1_nascimento: { value: '2015-03-22' },
    acomp_2_nome: { value: 'Beltrano de Tal' },
    acomp_2_cpf: { value: '98765432100' },
    acomp_2_nascimento: { value: '2018-07-09' },
    aceite: { value: '1' },
    data_desejada: { value: '2026-09-25' },
  },
});

describe('§5.7.1: mapWpFlatPayload — perfil wp_flat_v1', () => {
  it('normaliza o responsável (CPF só dígitos, telefone só dígitos, lê value não formatted)', () => {
    const r = mapWpFlatPayload(base());
    expect(r.formId).toBe('4641');
    expect(r.entryId).toBe('2');
    expect(r.responsible.fullName).toBe('Heitor Sampaio');
    expect(r.responsible.cpf).toBe('90000010057');
    expect(r.responsible.phone).toBe('48999998877');
    expect(r.responsible.email).toBe('contato@exemplo.com');
    expect(r.responsible.birthDate).toEqual(parseLocalDate('1989-01-14'));
    expect(r.address.state).toBe('SC'); // value, não "Santa Catarina"
    expect(r.address.zip).toBe('88036100');
  });

  it('varre acomp_{n}_* e devolve os acompanhantes na ordem', () => {
    const r = mapWpFlatPayload(base());
    expect(r.companions).toHaveLength(2);
    expect(r.companions[0]!.fullName).toBe('Fulana de Tal');
    expect(r.companions[0]!.cpf).toBe('12345678909');
    expect(r.companions[1]!.birthDate).toEqual(parseLocalDate('2018-07-09'));
  });

  it('veículo e consentimento e data desejada', () => {
    const r = mapWpFlatPayload(base());
    expect(r.vehicle?.brand).toBe('Ford');
    expect(r.vehicle?.plate).toBe('ABC-1234');
    expect(r.vehicle?.plateValid).toBe(true);
    expect(r.consent).toBe(true);
    expect(r.desiredDate).toEqual(parseLocalDate('2026-09-25'));
    expect(r.submitted).toBe('2026-08-11T18:57:17-03:00');
  });

  it('aceita array de um elemento lendo [0].body', () => {
    const wrapped = [{ webhookUrl: 'x', body: base() }];
    const r = mapWpFlatPayload(wrapped);
    expect(r.responsible.fullName).toBe('Heitor Sampaio');
  });

  it('campo obrigatório ausente → IntakeValidationError com o campo', () => {
    const p = base();
    delete (p.fields as Record<string, unknown>).resp_nome;
    expect(() => mapWpFlatPayload(p)).toThrowError(
      expect.objectContaining({ field: 'resp_nome', code: 'required' }),
    );
  });

  it('CPF do responsável com dígito inválido → 422 invalid_check_digit', () => {
    const p = base();
    p.fields.resp_cpf = { value: '90000010000' };
    try {
      mapWpFlatPayload(p);
      throw new Error('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(IntakeValidationError);
      expect((e as IntakeValidationError).field).toBe('resp_cpf');
      expect((e as IntakeValidationError).code).toBe('invalid_check_digit');
    }
  });

  it('e-mail sem @ → 422 invalid_email', () => {
    const p = base();
    p.fields.resp_email = { value: 'contato-exemplo.com' };
    expect(() => mapWpFlatPayload(p)).toThrowError(
      expect.objectContaining({ field: 'resp_email', code: 'invalid_email' }),
    );
  });

  it('telefone com menos de 10 dígitos → 422 invalid_phone', () => {
    const p = base();
    p.fields.resp_telefone = { value: '9999' };
    expect(() => mapWpFlatPayload(p)).toThrowError(
      expect.objectContaining({ field: 'resp_telefone', code: 'invalid_phone' }),
    );
  });

  it('bloco de acompanhante incompleto → 422 no campo culpado', () => {
    const p = base();
    delete (p.fields as Record<string, unknown>).acomp_2_cpf;
    expect(() => mapWpFlatPayload(p)).toThrowError(
      expect.objectContaining({ field: 'acomp_2_cpf', code: 'required' }),
    );
  });

  it('placa malformada (opcional) não bloqueia: grava como veio, plateValid false e aviso', () => {
    const p = base();
    p.fields.placa = { value: 'XX' };
    const r = mapWpFlatPayload(p);
    expect(r.vehicle?.plate).toBe('XX');
    expect(r.vehicle?.plateValid).toBe(false);
    expect(r.warnings.some((w) => w.includes('placa'))).toBe(true);
  });

  it('campo desconhecido vai para custom_fields e gera aviso', () => {
    const p = base();
    (p.fields as Record<string, unknown>).campo_estranho = { value: 'xyz' };
    const r = mapWpFlatPayload(p);
    expect(r.customFields.campo_estranho).toBe('xyz');
    expect(r.warnings.some((w) => w.includes('campo_estranho'))).toBe(true);
  });

  it('sem veículo: vehicle é null', () => {
    const p = base();
    delete (p.fields as Record<string, unknown>).marca;
    delete (p.fields as Record<string, unknown>).modelo;
    delete (p.fields as Record<string, unknown>).placa;
    const r = mapWpFlatPayload(p);
    expect(r.vehicle).toBeNull();
  });

  it('aceite diferente de "1" não registra consentimento', () => {
    const p = base();
    p.fields.aceite = { value: '0' };
    expect(mapWpFlatPayload(p).consent).toBe(false);
  });
});
